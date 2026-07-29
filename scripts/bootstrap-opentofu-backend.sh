#!/usr/bin/env bash
# Einmaliger Bootstrap für OpenTofu Remote-State (#274).
# Erzeugt S3-Bucket + DynamoDB-Lock-Tabelle. Idempotent-ish: Fehler bei
# "already exists" sind ok.
#
# Aufruf: ./scripts/bootstrap-opentofu-backend.sh

set -euo pipefail

BUCKET="${STATE_BUCKET:-yogaswap-opentofu-state}"
TABLE="${LOCK_TABLE:-yogaswap-opentofu-locks}"
REGION="${AWS_REGION:-eu-central-1}"

echo "Bucket: $BUCKET"
echo "Lock:   $TABLE"
echo "Region: $REGION"
echo ""

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "✅ Bucket existiert bereits"
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
  echo "✅ Bucket angelegt"
fi

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" &>/dev/null; then
  echo "✅ Lock-Tabelle existiert bereits"
else
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    --tags Key=Project,Value=yogaswap Key=ManagedBy,Value=bootstrap Key=Purpose,Value=opentofu-lock
  echo "✅ Lock-Tabelle angelegt (Status kann kurz CREATING sein)"
fi

echo ""
echo "Fertig. Weiter: docs/opentofu-remote-state.md (Migration)"
