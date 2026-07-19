#!/usr/bin/env bash
set -euo pipefail

region="${AWS_DEFAULT_REGION:-us-east-1}"

create_queue_with_dlq() {
  local queue_name="$1"
  local visibility_timeout="$2"
  local dlq_name="${queue_name}-dlq"

  awslocal sqs create-queue --region "$region" --queue-name "$dlq_name" >/dev/null
  local dlq_url
  dlq_url="$(awslocal sqs get-queue-url --region "$region" --queue-name "$dlq_name" --query QueueUrl --output text)"
  local dlq_arn
  dlq_arn="$(awslocal sqs get-queue-attributes --region "$region" --queue-url "$dlq_url" --attribute-names QueueArn --query Attributes.QueueArn --output text)"

  awslocal sqs create-queue \
    --region "$region" \
    --queue-name "$queue_name" \
    --attributes "{\"VisibilityTimeout\":\"${visibility_timeout}\",\"ReceiveMessageWaitTimeSeconds\":\"20\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}" \
    >/dev/null
}

create_queue_with_dlq copilot-ingestion 60
create_queue_with_dlq copilot-analysis 360
