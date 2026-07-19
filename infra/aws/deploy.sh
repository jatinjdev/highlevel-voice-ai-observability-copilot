#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROFILE="${AWS_PROFILE:-SysAdmin}"
REGION="${AWS_REGION:-ap-south-1}"
STACK_NAME="${STACK_NAME:-voice-ai-observability}"
PROJECT_NAME="${PROJECT_NAME:-voice-ai-observability}"
IMAGE_TAG="${IMAGE_TAG:-$(date -u +%Y%m%d%H%M%S)}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

for command in aws docker jq openssl pnpm; do
  command -v "$command" >/dev/null || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

set -a
source "$ENV_FILE"
set +a

if [[ -z "${HIGHLEVEL_CLIENT_ID:-}" || -z "${HIGHLEVEL_CLIENT_SECRET:-}" || -z "${HIGHLEVEL_TOKEN_ENCRYPTION_KEY:-}" ]]; then
  echo 'HighLevel OAuth and token-encryption values are required.' >&2
  exit 1
fi

production_llm_provider="${PRODUCTION_LLM_PROVIDER:-${LLM_PROVIDER:-none}}"
if [[ "$production_llm_provider" == "opencode" ]]; then
  echo 'The local OpenCode adapter is not deployable as an unattended production credential. Set PRODUCTION_LLM_PROVIDER=openai-compatible with LLM_API_KEY, or use none for an infrastructure-only smoke test.' >&2
  exit 1
fi
if [[ "$production_llm_provider" == "openai-compatible" && -z "${LLM_API_KEY:-}" ]]; then
  echo 'LLM_API_KEY is required for production semantic analysis.' >&2
  exit 1
fi

aws sts get-caller-identity --profile "$PROFILE" >/dev/null

aws cloudformation deploy \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file infra/aws/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides ProjectName="$PROJECT_NAME" \
  --no-fail-on-empty-changeset

outputs="$(aws cloudformation describe-stacks --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs' --output json)"
output() { printf '%s' "$outputs" | jq -r --arg key "$1" '.[] | select(.OutputKey == $key) | .OutputValue'; }

repository_uri="$(output ApplicationRepositoryUri)"
secret_arn="$(output ApplicationSecretArn)"
bucket="$(output FrontendBucketName)"
distribution_id="$(output CloudFrontDistributionId)"
cloudfront_domain="$(output CloudFrontDomain)"
instance_id="$(output ApplicationInstanceId)"
web_origin="https://$cloudfront_domain"

account_id="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"
aws ecr get-login-password --profile "$PROFILE" --region "$REGION" | docker login --username AWS --password-stdin "$account_id.dkr.ecr.$REGION.amazonaws.com"
docker buildx build --platform linux/amd64 --push -t "$repository_uri:$IMAGE_TAG" .

marketplace_shared_secret="${HIGHLEVEL_APP_SHARED_SECRET:-}"
if [[ -z "$marketplace_shared_secret" ]]; then
  marketplace_shared_secret="$(aws secretsmanager get-secret-value \
    --profile "$PROFILE" \
    --region "$REGION" \
    --secret-id "$secret_arn" \
    --query SecretString \
    --output text | jq -r '.HIGHLEVEL_APP_SHARED_SECRET // empty')"
fi
if [[ -z "$marketplace_shared_secret" ]]; then
  marketplace_shared_secret="$(openssl rand -hex 32)"
  generated_marketplace_secret=true
else
  generated_marketplace_secret=false
fi

secret_json="$(jq -n \
  --arg imageTag "$IMAGE_TAG" \
  --arg WEB_ORIGIN "$web_origin" \
  --arg HIGHLEVEL_CLIENT_ID "$HIGHLEVEL_CLIENT_ID" \
  --arg HIGHLEVEL_CLIENT_SECRET "$HIGHLEVEL_CLIENT_SECRET" \
  --arg HIGHLEVEL_APP_ID "${HIGHLEVEL_APP_ID:-${HIGHLEVEL_CLIENT_ID%%-*}}" \
  --arg HIGHLEVEL_REDIRECT_URI "$web_origin/api/leadconnector/oauth" \
  --arg HIGHLEVEL_POST_INSTALL_REDIRECT_URI "$web_origin" \
  --arg HIGHLEVEL_TOKEN_ENCRYPTION_KEY "$HIGHLEVEL_TOKEN_ENCRYPTION_KEY" \
  --arg HIGHLEVEL_APP_SHARED_SECRET "$marketplace_shared_secret" \
  --arg LLM_PROVIDER "$production_llm_provider" \
  --arg LLM_PROVIDER_ID "${LLM_PROVIDER_ID:-openai}" \
  --arg LLM_BASE_URL "${LLM_BASE_URL:-https://api.openai.com/v1}" \
  --arg LLM_MODEL "${LLM_MODEL:-gpt-5.4}" \
  --arg LLM_API_KEY "${LLM_API_KEY:-}" \
  --arg LLM_STRUCTURED_OUTPUT_MODE "${LLM_STRUCTURED_OUTPUT_MODE:-json_schema}" \
  --arg LLM_MAX_OUTPUT_TOKENS "${LLM_MAX_OUTPUT_TOKENS:-8192}" \
  --arg LLM_REQUEST_TIMEOUT_MS "${LLM_REQUEST_TIMEOUT_MS:-180000}" \
  --arg LLM_EXTRA_BODY_JSON "${LLM_EXTRA_BODY_JSON:-{}}" \
  --arg ANALYSIS_CONCURRENCY "${ANALYSIS_CONCURRENCY:-2}" \
  '$ARGS.named')"

aws secretsmanager put-secret-value --profile "$PROFILE" --region "$REGION" --secret-id "$secret_arn" --secret-string "$secret_json" >/dev/null

pnpm --filter @copilot/web build
aws s3 sync apps/web/dist "s3://$bucket" --profile "$PROFILE" --region "$REGION" --delete
aws cloudfront create-invalidation --profile "$PROFILE" --distribution-id "$distribution_id" --paths '/*' >/dev/null

command_id="$(aws ssm send-command \
  --profile "$PROFILE" \
  --region "$REGION" \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["sudo /usr/local/bin/deploy-voice-agent"]' \
  --query Command.CommandId \
  --output text)"
aws ssm wait command-executed --profile "$PROFILE" --region "$REGION" --command-id "$command_id" --instance-id "$instance_id"
aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" --command-id "$command_id" --instance-id "$instance_id" --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' --output json

curl --fail --retry 18 --retry-delay 10 "$web_origin/api/health"

printf '\nDeployment complete\n'
printf 'UI: %s\n' "$web_origin"
printf 'Webhook: %s/api/leadconnector/webhook\n' "$web_origin"
printf 'OAuth redirect: %s/api/leadconnector/oauth\n' "$web_origin"
if [[ "$generated_marketplace_secret" == true ]]; then
  printf 'A Marketplace Custom Page shared secret was generated in Secrets Manager. Retrieve it securely with:\n'
  printf 'aws secretsmanager get-secret-value --profile %q --region %q --secret-id %q --query SecretString --output text | jq -r .HIGHLEVEL_APP_SHARED_SECRET\n' "$PROFILE" "$REGION" "$secret_arn"
fi
