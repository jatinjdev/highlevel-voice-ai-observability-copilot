# AWS deployment runbook

The application uses a deliberately small AWS deployment:

- CloudFront and a private S3 bucket serve the Vue dashboard;
- an ALB routes `/api/*` to one EC2 instance;
- Docker Compose runs the API, ingestion worker, and analysis worker on that host;
- private RDS PostgreSQL stores application data;
- separate SQS queues and DLQs connect ingestion and analysis;
- one ECR repository stores immutable backend images;
- Secrets Manager stores HighLevel, model-provider, and database credentials;
- SSM manages the host without SSH;
- CloudWatch receives container logs and basic health, queue-age, and DLQ alarms.

The ALB accepts inbound application traffic only from AWS's managed CloudFront
origin-facing network. EC2 accepts port 3000 only from the ALB, and PostgreSQL
accepts port 5432 only from the application security group.

## Deployment commands

```bash
bash infra/aws/deploy.sh infra
bash infra/aws/deploy.sh backend
bash infra/aws/deploy.sh frontend
bash infra/aws/deploy.sh config api
bash infra/aws/deploy.sh config ingestion
bash infra/aws/deploy.sh config analysis
bash infra/aws/deploy.sh config all
bash infra/aws/deploy.sh all
```

| Command           | Behavior                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `infra`           | Update CloudFormation only                                         |
| `backend`         | Build one commit-tagged image, run migrations, and update Compose  |
| `frontend`        | Publish Vue assets and invalidate only the HTML entry points       |
| `config <target>` | Update Secrets Manager and recreate only the selected container(s) |
| `all`             | Run checks and perform the complete deployment in order            |

The commands default to `AWS_PROFILE=SysAdmin`, `AWS_REGION=ap-south-1`, and
`STACK_NAME=voice-ai-observability`.

## Backend release

The backend release intentionally uses ordinary Docker layer caching:

1. dependency manifests are copied before application source;
2. Docker reuses the dependency layers while the manifests remain unchanged;
3. the image is tagged with the Git commit and pushed to the immutable ECR repository;
4. SSM installs the checked-in Compose file and asks the host to pull the image;
5. Compose runs pending Drizzle migrations and recreates the three containers;
6. the command succeeds only after the API's database-backed health check passes.

There is no custom automatic rollback system. To roll back, deploy a previously
known image tag. Database changes should therefore use backward-compatible
expand/contract migrations.

The containers run as the image's non-root user with read-only filesystems,
dropped capabilities, memory limits, and a 60-second graceful-stop period.

## Configuration-only changes

The application configuration is stored in Secrets Manager. A configuration
deployment does not build or push an image. The host refreshes the environment
files and asks Compose to recreate only `api`, `ingestion`, `analysis`, or all
three containers.

Use an unattended OpenAI-compatible provider credential, or set the provider to
`none` for an infrastructure-only smoke test.

## Frontend caching

- content-hashed JavaScript and CSS use a one-year immutable cache policy;
- HTML and other entry files use `no-cache`;
- only `/` and `/index.html` are invalidated;
- `/api/*` uses CloudFront's caching-disabled policy.

## Marketplace endpoints

- OAuth redirect: `https://<distribution>/api/leadconnector/oauth`
- Webhook: `https://<distribution>/api/leadconnector/webhook`
- Custom Page URL: `https://<distribution>/`

Use CloudWatch logs and SSM Session Manager for runtime diagnosis. The EC2 host
has no inbound SSH rule.
