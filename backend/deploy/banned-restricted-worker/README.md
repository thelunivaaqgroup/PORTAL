# Banned/Restricted Sync Worker

Standalone worker that fetches banned/restricted chemical data from AICIS
(industrialchemicals.gov.au) using a headless Chromium browser, extracts CAS
numbers, and stores them in the portal database.

## Why a separate worker?

The AICIS website is protected by Akamai Bot Manager which blocks requests from
many cloud/local IPs. The sync must run from an environment whose IP is not
blocked — typically an AWS instance in `ap-southeast-2` (Sydney).

## Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (same as portal backend) |
| `ACTOR_USER_ID` | (Optional) User ID for audit trail. Defaults to first `SUPER_ADMIN`. |
| `NODE_ENV` | Set to `production` in deployed environments |

## Running Locally

```bash
# From backend/
pnpm banned:sync
```

- Exit code `0` = success (`isComplete=true`, chemicals extracted)
- Exit code `2` = incomplete (sources unreachable, snapshot saved as artifact)
- Exit code `1` = fatal error (DB connection failed, etc.)

## Running on EC2

```bash
# SSH into instance, clone repo, install deps
cd portal/backend
cp .env.production .env   # must contain DATABASE_URL
pnpm install
npx playwright install chromium --with-deps
pnpm banned:sync
```

## Deploying to AWS ECS Fargate

### Prerequisites

1. ECR repository: `portal/banned-restricted-worker`
2. ECS cluster: `portal-cluster`
3. VPC subnets with internet access + DB access
4. Security group allowing outbound HTTPS (443) and DB port (5432)
5. IAM execution role with ECR pull + CloudWatch Logs + Secrets Manager access
6. Secrets Manager entries for `DATABASE_URL` and `ACTOR_USER_ID`

### One-time deploy + manual run

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-southeast-2
export SUBNET_IDS=subnet-abc123,subnet-def456
export SECURITY_GROUP_ID=sg-xyz789
export EXECUTION_ROLE_ARN=arn:aws:iam::123456789012:role/ecsTaskExecutionRole
export DATABASE_URL_SECRET_ARN=arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:portal/db-url
export ACTOR_USER_ID_SECRET_ARN=arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:portal/actor-user-id

./deploy/banned-restricted-worker/deploy.sh
```

### Deploy with weekly cron schedule

```bash
./deploy/banned-restricted-worker/deploy.sh --schedule
```

This creates an EventBridge rule that runs the sync every Monday at 2am UTC.

### Manual trigger (after initial deploy)

```bash
aws ecs run-task \
  --cluster portal-cluster \
  --task-definition banned-restricted-sync-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-abc],securityGroups=[sg-xyz],assignPublicIp=ENABLED}" \
  --region ap-southeast-2
```

### Manual trigger via API (requires auth)

```bash
curl -X POST https://your-api.example.com/banned-restricted/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

## Verification

After a successful sync:

```sql
-- Check latest snapshot
SELECT id, "isComplete", notes, "fetchedAt"
FROM banned_restricted_snapshots
ORDER BY "fetchedAt" DESC LIMIT 1;

-- Check sources
SELECT "sourceName", "linkType", "fetchStatus", "errorMessage"
FROM banned_restricted_sources
WHERE "snapshotId" = '<snapshot_id>';

-- Check chemicals
SELECT COUNT(*) FROM banned_restricted_chemicals
WHERE "snapshotId" = '<snapshot_id>';
```

- `isComplete = true` means chemicals were extracted successfully
- `isComplete = false` means sources were unreachable — UI shows "CANNOT CHECK"
