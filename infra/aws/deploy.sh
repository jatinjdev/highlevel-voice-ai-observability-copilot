#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMMAND="${1:-}"
CONFIG_TARGET="${2:-all}"
PROFILE="${AWS_PROFILE:-SysAdmin}"
REGION="${AWS_REGION:-ap-south-1}"
STACK_NAME="${STACK_NAME:-voice-ai-observability}"
PROJECT_NAME="${PROJECT_NAME:-voice-ai-observability}"
ENV_FILE="${ENV_FILE:-.env}"
TEMP_FILES=()

cleanup() {
  if ((${#TEMP_FILES[@]} > 0)); then rm -f -- "${TEMP_FILES[@]}"; fi
}
trap cleanup EXIT

usage() {
  cat <<'USAGE'
Usage: bash infra/aws/deploy.sh <command> [target]

Commands:
  infra             Update CloudFormation only.
  backend           Build the backend image, migrate, and update the containers.
  frontend          Build and publish the Vue application only.
  config <target>   Update configuration and recreate api, ingestion, analysis, or all.
  all               Run checks and deploy infrastructure, configuration, backend, and frontend.
USAGE
}

case "$COMMAND" in
  infra | backend | frontend | config | all) ;;
  *) usage; exit 2 ;;
esac
case "$CONFIG_TARGET" in
  api | ingestion | analysis | all) ;;
  *) echo "Unknown configuration target: $CONFIG_TARGET" >&2; exit 2 ;;
esac

for executable in aws base64 curl jq node; do
  command -v "$executable" >/dev/null || {
    echo "Missing required command: $executable" >&2
    exit 1
  }
done

aws_cli() {
  aws --profile "$PROFILE" --region "$REGION" "$@"
}

aws_cli sts get-caller-identity >/dev/null

ensure_release_tools() {
  for executable in docker git pnpm; do
    command -v "$executable" >/dev/null || {
      echo "Missing required command: $executable" >&2
      exit 1
    }
  done
}

run_checks() {
  pnpm format:check
  pnpm check
}

deploy_infrastructure() {
  local cloudfront_prefix_list
  cloudfront_prefix_list="$(aws_cli ec2 describe-managed-prefix-lists \
    --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
    --query 'PrefixLists[0].PrefixListId' \
    --output text)"
  if [[ -z "$cloudfront_prefix_list" || "$cloudfront_prefix_list" == None ]]; then
    echo 'The CloudFront origin-facing managed prefix list could not be resolved.' >&2
    exit 1
  fi

  aws cloudformation deploy \
    --profile "$PROFILE" \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --template-file infra/aws/cloudformation.yml \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
      ProjectName="$PROJECT_NAME" \
      CloudFrontOriginFacingPrefixListId="$cloudfront_prefix_list" \
    --tags Application="$PROJECT_NAME" ManagedBy=CloudFormation \
    --no-fail-on-empty-changeset
}

load_stack_outputs() {
  OUTPUTS="$(aws_cli cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query 'Stacks[0].Outputs' \
    --output json)"
}

output() {
  jq -r --arg key "$1" '.[] | select(.OutputKey == $key) | .OutputValue' <<<"$OUTPUTS"
}

require_output() {
  local value
  value="$(output "$1")"
  if [[ -z "$value" || "$value" == null ]]; then
    echo "CloudFormation output is missing: $1" >&2
    exit 1
  fi
  printf '%s' "$value"
}

update_application_configuration() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing configuration file: $ENV_FILE" >&2
    exit 1
  fi

  local secret_arn web_origin existing_json existing_shared_secret secret_file
  secret_arn="$(require_output ApplicationSecretArn)"
  web_origin="https://$(require_output CloudFrontDomain)"
  existing_json="$(aws_cli secretsmanager get-secret-value \
    --secret-id "$secret_arn" \
    --query SecretString \
    --output text)"
  existing_shared_secret="$(jq -r '.HIGHLEVEL_APP_SHARED_SECRET // empty' <<<"$existing_json")"
  secret_file="$(mktemp)"
  TEMP_FILES+=("$secret_file")

  EXISTING_HIGHLEVEL_APP_SHARED_SECRET="$existing_shared_secret" \
    node --env-file="$ENV_FILE" infra/aws/render-application-secret.mjs "$web_origin" >"$secret_file"
  aws_cli secretsmanager put-secret-value \
    --secret-id "$secret_arn" \
    --secret-string "file://$secret_file" >/dev/null
}

build_backend_image() {
  ensure_release_tools
  if [[ "${SKIP_CHECKS:-false}" != true ]]; then run_checks; fi

  local repository_uri repository_name account_id commit image_tag existing_digest
  repository_uri="$(require_output ApplicationRepositoryUri)"
  repository_name="${repository_uri##*/}"
  account_id="$(aws_cli sts get-caller-identity --query Account --output text)"
  commit="$(git rev-parse --verify HEAD)"

  if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY_BUILD:-false}" != true ]]; then
    echo 'Refusing to publish an image from a dirty working tree. Commit it or set ALLOW_DIRTY_BUILD=true explicitly.' >&2
    exit 1
  fi
  image_tag="${IMAGE_TAG:-${commit:0:12}}"
  BACKEND_IMAGE="$repository_uri:$image_tag"

  aws_cli ecr get-login-password |
    docker login --username AWS --password-stdin "$account_id.dkr.ecr.$REGION.amazonaws.com"
  existing_digest="$(aws_cli ecr describe-images \
    --repository-name "$repository_name" \
    --image-ids imageTag="$image_tag" \
    --query 'imageDetails[0].imageDigest' \
    --output text 2>/dev/null || true)"

  if [[ -n "$existing_digest" && "$existing_digest" != None ]]; then
    printf 'Reusing immutable image %s.\n' "$BACKEND_IMAGE"
    return
  fi

  docker build --platform linux/amd64 --tag "$BACKEND_IMAGE" .
  docker push "$BACKEND_IMAGE"
}

write_remote_configuration() {
  local file="$1"
  {
    printf 'AWS_REGION=%q\n' "$REGION"
    printf 'AWS_ACCOUNT_ID=%q\n' "$(aws_cli sts get-caller-identity --query Account --output text)"
    printf 'APPLICATION_SECRET_ARN=%q\n' "$(require_output ApplicationSecretArn)"
    printf 'DATABASE_SECRET_ARN=%q\n' "$(require_output DatabaseSecretArn)"
    printf 'DATABASE_HOST=%q\n' "$(require_output DatabaseEndpoint)"
    printf 'DATABASE_PORT=%q\n' 5432
    printf 'INGESTION_QUEUE_URL=%q\n' "$(require_output IngestionQueueUrl)"
    printf 'ANALYSIS_QUEUE_URL=%q\n' "$(require_output AnalysisQueueUrl)"
    printf 'LOG_GROUP_NAME=%q\n' "$(require_output ApplicationLogGroupName)"
  } >"$file"
}

run_on_runtime_host() {
  local mode="$1"
  local target="$2"
  local image="${3:-}"
  local instance_id script_payload compose_payload config_file config_payload parameters command_id status
  instance_id="$(require_output ApplicationInstanceId)"
  config_file="$(mktemp)"
  parameters="$(mktemp)"
  TEMP_FILES+=("$config_file" "$parameters")
  write_remote_configuration "$config_file"
  script_payload="$(base64 <infra/aws/runtime-deploy.sh | tr -d '\n')"
  compose_payload="$(base64 <compose.production.yaml | tr -d '\n')"
  config_payload="$(base64 <"$config_file" | tr -d '\n')"

  jq -n \
    --arg script "$script_payload" \
    --arg compose "$compose_payload" \
    --arg config "$config_payload" \
    --arg mode "$mode" \
    --arg target "$target" \
    --arg image "$image" \
    '{commands: [
      "sudo install -d -m 700 /etc/voice-ai-observability /opt/voice-ai-observability",
      ("printf %s " + ($script | @sh) + " | base64 -d | sudo tee /usr/local/bin/deploy-voice-agent >/dev/null"),
      "sudo chmod 700 /usr/local/bin/deploy-voice-agent",
      ("printf %s " + ($compose | @sh) + " | base64 -d | sudo tee /opt/voice-ai-observability/compose.yaml >/dev/null"),
      ("printf %s " + ($config | @sh) + " | base64 -d | sudo tee /etc/voice-ai-observability/deployment.env >/dev/null"),
      "sudo chmod 600 /etc/voice-ai-observability/deployment.env",
      ("sudo " + (if ($image | length) > 0 then "IMAGE=" + ($image | @sh) + " " else "" end) + "/usr/local/bin/deploy-voice-agent " + ($mode | @sh) + " " + ($target | @sh))
    ]}' >"$parameters"

  command_id="$(aws_cli ssm send-command \
    --instance-ids "$instance_id" \
    --document-name AWS-RunShellScript \
    --parameters "file://$parameters" \
    --query Command.CommandId \
    --output text)"

  for _ in {1..120}; do
    status="$(aws_cli ssm get-command-invocation \
      --command-id "$command_id" \
      --instance-id "$instance_id" \
      --query Status \
      --output text 2>/dev/null || true)"
    case "$status" in
      Success | Failed | Cancelled | TimedOut | Cancelling) break ;;
      *) sleep 5 ;;
    esac
  done
  aws_cli ssm get-command-invocation \
    --command-id "$command_id" \
    --instance-id "$instance_id" \
    --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' \
    --output json
  if [[ "$status" != Success ]]; then
    echo "Runtime command did not succeed (status: ${status:-unknown})." >&2
    exit 1
  fi
}

deploy_frontend() {
  ensure_release_tools
  local bucket distribution
  bucket="$(require_output FrontendBucketName)"
  distribution="$(require_output CloudFrontDistributionId)"
  pnpm --filter @copilot/web build
  aws s3 sync apps/web/dist/assets "s3://$bucket/assets" \
    --profile "$PROFILE" --region "$REGION" --delete \
    --cache-control 'public,max-age=31536000,immutable'
  aws s3 sync apps/web/dist "s3://$bucket" \
    --profile "$PROFILE" --region "$REGION" --delete \
    --exclude 'assets/*' \
    --cache-control 'no-cache,must-revalidate'
  aws_cli cloudfront create-invalidation \
    --distribution-id "$distribution" \
    --paths '/' '/index.html' >/dev/null
}

release_backend() {
  build_backend_image
  run_on_runtime_host deploy all "$BACKEND_IMAGE"
  curl --fail --retry 18 --retry-delay 10 \
    "https://$(require_output CloudFrontDomain)/api/health/ready"
}

case "$COMMAND" in
  infra)
    deploy_infrastructure
    ;;
  backend)
    load_stack_outputs
    release_backend
    ;;
  frontend)
    load_stack_outputs
    deploy_frontend
    ;;
  config)
    load_stack_outputs
    update_application_configuration
    run_on_runtime_host config "$CONFIG_TARGET"
    ;;
  all)
    ensure_release_tools
    run_checks
    export SKIP_CHECKS=true
    deploy_infrastructure
    load_stack_outputs
    update_application_configuration
    release_backend
    deploy_frontend
    ;;
esac
