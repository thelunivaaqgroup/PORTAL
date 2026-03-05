#!/usr/bin/env bash
set -euo pipefail

#
# Deploy the banned-restricted sync worker to AWS ECS Fargate.
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - ECR repository created
#   - ECS cluster exists
#   - Secrets Manager entries for DATABASE_URL and ACTOR_USER_ID
#   - VPC with subnets that can reach your PostgreSQL database
#
# Usage:
#   ./deploy.sh                     # Build, push, register task, run once
#   ./deploy.sh --schedule          # Also create EventBridge scheduled rule
#

# ── Configuration (set these or use environment variables) ──
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
ECR_REPO="${ECR_REPO:-portal/banned-restricted-worker}"
ECS_CLUSTER="${ECS_CLUSTER:-portal-cluster}"
SUBNET_IDS="${SUBNET_IDS:?Set SUBNET_IDS (comma-separated)}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:?Set SECURITY_GROUP_ID}"
EXECUTION_ROLE_ARN="${EXECUTION_ROLE_ARN:?Set EXECUTION_ROLE_ARN}"
TASK_ROLE_ARN="${TASK_ROLE_ARN:-$EXECUTION_ROLE_ARN}"
DATABASE_URL_SECRET_ARN="${DATABASE_URL_SECRET_ARN:?Set DATABASE_URL_SECRET_ARN}"
ACTOR_USER_ID_SECRET_ARN="${ACTOR_USER_ID_SECRET_ARN:?Set ACTOR_USER_ID_SECRET_ARN}"
LOG_GROUP="${LOG_GROUP:-/ecs/banned-restricted-sync}"

ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

echo "=== Building Docker image ==="
cd "$(dirname "$0")/../.."
docker build -f deploy/banned-restricted-worker/Dockerfile -t "${ECR_REPO}:latest" .

echo "=== Pushing to ECR ==="
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker tag "${ECR_REPO}:latest" "${ECR_IMAGE_URI}:latest"
docker push "${ECR_IMAGE_URI}:latest"

echo "=== Creating CloudWatch log group ==="
aws logs create-log-group --log-group-name "${LOG_GROUP}" --region "${AWS_REGION}" 2>/dev/null || true

echo "=== Registering ECS task definition ==="
TASK_DEF=$(cat deploy/banned-restricted-worker/task-definition.json | \
  sed "s|\${EXECUTION_ROLE_ARN}|${EXECUTION_ROLE_ARN}|g" | \
  sed "s|\${TASK_ROLE_ARN}|${TASK_ROLE_ARN}|g" | \
  sed "s|\${ECR_IMAGE_URI}|${ECR_IMAGE_URI}:latest|g" | \
  sed "s|\${DATABASE_URL_SECRET_ARN}|${DATABASE_URL_SECRET_ARN}|g" | \
  sed "s|\${ACTOR_USER_ID_SECRET_ARN}|${ACTOR_USER_ID_SECRET_ARN}|g" | \
  sed "s|\${AWS_REGION}|${AWS_REGION}|g")

echo "${TASK_DEF}" | aws ecs register-task-definition \
  --cli-input-json file:///dev/stdin \
  --region "${AWS_REGION}"

echo "=== Running task (one-shot) ==="
aws ecs run-task \
  --cluster "${ECS_CLUSTER}" \
  --task-definition "banned-restricted-sync-worker" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_IDS}],securityGroups=[${SECURITY_GROUP_ID}],assignPublicIp=ENABLED}" \
  --region "${AWS_REGION}"

echo "=== Task launched ==="

# ── Optional: Create scheduled rule (weekly, Monday 2am UTC) ──
if [[ "${1:-}" == "--schedule" ]]; then
  SCHEDULE_ROLE_ARN="${SCHEDULE_ROLE_ARN:-$EXECUTION_ROLE_ARN}"

  echo "=== Creating EventBridge scheduled rule ==="
  aws events put-rule \
    --name "banned-restricted-sync-weekly" \
    --schedule-expression "cron(0 2 ? * MON *)" \
    --state ENABLED \
    --description "Weekly banned/restricted sync from AICIS sources" \
    --region "${AWS_REGION}"

  # Create target JSON
  TARGET_JSON=$(cat <<EOFTARGET
[{
  "Id": "sync-worker",
  "Arn": "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/${ECS_CLUSTER}",
  "RoleArn": "${SCHEDULE_ROLE_ARN}",
  "EcsParameters": {
    "TaskDefinitionArn": "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:task-definition/banned-restricted-sync-worker",
    "TaskCount": 1,
    "LaunchType": "FARGATE",
    "NetworkConfiguration": {
      "awsvpcConfiguration": {
        "Subnets": [$(echo "${SUBNET_IDS}" | sed 's/,/","/g' | sed 's/^/"/;s/$/"/')],
        "SecurityGroups": ["${SECURITY_GROUP_ID}"],
        "AssignPublicIp": "ENABLED"
      }
    }
  }
}]
EOFTARGET
  )

  echo "${TARGET_JSON}" | aws events put-targets \
    --rule "banned-restricted-sync-weekly" \
    --targets file:///dev/stdin \
    --region "${AWS_REGION}"

  echo "=== Weekly schedule created (Monday 2am UTC) ==="
fi

echo "Done."
