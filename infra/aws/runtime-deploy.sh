#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-deploy}"
TARGET="${2:-all}"
CONFIG_FILE="${VOICE_AI_DEPLOYMENT_CONFIG:-/etc/voice-ai-observability/deployment.env}"
RUNTIME_DIR=/etc/voice-ai-observability
APP_DIR=/opt/voice-ai-observability
COMPOSE_FILE="$APP_DIR/compose.yaml"
COMPOSE_ENV="$APP_DIR/deployment.env"

if [[ ! -f "$CONFIG_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  echo 'The runtime configuration or Compose file has not been installed.' >&2
  exit 1
fi

# Generated from CloudFormation outputs. It contains resource identifiers only.
# shellcheck disable=SC1090
source "$CONFIG_FILE"

required=(
  AWS_REGION AWS_ACCOUNT_ID APPLICATION_SECRET_ARN DATABASE_SECRET_ARN DATABASE_HOST
  DATABASE_PORT INGESTION_QUEUE_URL ANALYSIS_QUEUE_URL LOG_GROUP_NAME
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing deployment value: $name" >&2
    exit 1
  fi
done

case "$MODE" in deploy | config) ;; *) echo 'Mode must be deploy or config.' >&2; exit 2 ;; esac
case "$TARGET" in api | ingestion | analysis | all) ;; *) echo "Unknown target: $TARGET" >&2; exit 2 ;; esac

install -d -m 700 "$RUNTIME_DIR" "$APP_DIR"
umask 077

APP_JSON="$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$APPLICATION_SECRET_ARN" \
  --query SecretString \
  --output text)"
DB_JSON="$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$DATABASE_SECRET_ARN" \
  --query SecretString \
  --output text)"

DB_USER="$(jq -r '.username' <<<"$DB_JSON")"
DB_PASSWORD="$(jq -r '.password' <<<"$DB_JSON")"
DATABASE_URL="$(python3 - "$DB_USER" "$DB_PASSWORD" "$DATABASE_HOST" "$DATABASE_PORT" <<'PY'
import sys
from urllib.parse import quote

user, password, host, port = sys.argv[1:]
print(f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}/copilot?sslmode=verify-full")
PY
)"

write_secret() {
  local file="$1"
  local key="$2"
  local value
  value="$(jq -r --arg key "$key" '.[$key] // empty' <<<"$APP_JSON")"
  if [[ -n "$value" ]]; then printf '%s=%s\n' "$key" "$value" >>"$file"; fi
}

API_ENV="$RUNTIME_DIR/api.env"
INGESTION_ENV="$RUNTIME_DIR/ingestion-worker.env"
ANALYSIS_ENV="$RUNTIME_DIR/analysis-worker.env"

printf 'NODE_ENV=production\nPORT=3000\nAWS_REGION=%s\nDATABASE_URL=%s\nSQS_INGESTION_QUEUE_URL=%s\nSQS_ANALYSIS_QUEUE_URL=%s\nOUTBOX_PUBLISHER_ENABLED=true\n' \
  "$AWS_REGION" "$DATABASE_URL" "$INGESTION_QUEUE_URL" "$ANALYSIS_QUEUE_URL" >"$API_ENV"
for key in WEB_ORIGIN HIGHLEVEL_CLIENT_ID HIGHLEVEL_CLIENT_SECRET HIGHLEVEL_APP_ID HIGHLEVEL_REDIRECT_URI HIGHLEVEL_POST_INSTALL_REDIRECT_URI HIGHLEVEL_TOKEN_ENCRYPTION_KEY HIGHLEVEL_APP_SHARED_SECRET; do
  write_secret "$API_ENV" "$key"
done

printf 'NODE_ENV=production\nAWS_REGION=%s\nDATABASE_URL=%s\nSQS_INGESTION_QUEUE_URL=%s\n' \
  "$AWS_REGION" "$DATABASE_URL" "$INGESTION_QUEUE_URL" >"$INGESTION_ENV"

printf 'NODE_ENV=production\nAWS_REGION=%s\nDATABASE_URL=%s\nSQS_ANALYSIS_QUEUE_URL=%s\n' \
  "$AWS_REGION" "$DATABASE_URL" "$ANALYSIS_QUEUE_URL" >"$ANALYSIS_ENV"
for key in LLM_PROVIDER LLM_PROVIDER_ID LLM_BASE_URL LLM_MODEL LLM_API_KEY LLM_STRUCTURED_OUTPUT_MODE LLM_MAX_OUTPUT_TOKENS LLM_TEMPERATURE LLM_REQUEST_TIMEOUT_MS LLM_EXTRA_BODY_JSON ANALYSIS_CONCURRENCY; do
  write_secret "$ANALYSIS_ENV" "$key"
done
chmod 600 "$API_ENV" "$INGESTION_ENV" "$ANALYSIS_ENV"

if [[ "$MODE" == deploy ]]; then
  if [[ -z "${IMAGE:-}" ]]; then
    echo 'IMAGE is required for a backend deployment.' >&2
    exit 1
  fi
  printf 'IMAGE=%s\nAWS_REGION=%s\nLOG_GROUP_NAME=%s\n' \
    "$IMAGE" "$AWS_REGION" "$LOG_GROUP_NAME" >"$COMPOSE_ENV"
else
  if [[ ! -f "$COMPOSE_ENV" ]]; then
    echo 'Deploy the backend before applying a configuration-only restart.' >&2
    exit 1
  fi
fi
chmod 600 "$COMPOSE_ENV"

compose() {
  docker compose --env-file "$COMPOSE_ENV" --file "$COMPOSE_FILE" "$@"
}

remove_legacy_containers() {
  local name project
  for name in voice-ai-api voice-ai-ingestion-worker voice-ai-analysis-worker; do
    project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
    if [[ -z "$project" ]] && docker inspect "$name" >/dev/null 2>&1; then
      docker stop --time 60 "$name" >/dev/null
      docker rm "$name" >/dev/null
    fi
  done
}

if [[ "$MODE" == deploy ]]; then
  aws ecr get-login-password --region "$AWS_REGION" |
    docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
  compose pull
  compose run --rm --no-deps api node apps/api/dist/database/migrate.js
  remove_legacy_containers
  compose up --detach --wait --wait-timeout 120
elif [[ "$TARGET" == all ]]; then
  compose up --detach --force-recreate --wait --wait-timeout 120
else
  compose up --detach --no-deps --force-recreate --wait --wait-timeout 120 "$TARGET"
fi

compose ps
