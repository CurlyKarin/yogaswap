#!/bin/bash
set -e

echo "Checkmark Deploying to production..."

# 1. Apply Infrastructure
tofu apply -auto-approve

# 2. Generate .env.production
cat > ../../app/.env.production << EOF
VITE_COGNITO_USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(tofu output -raw cognito_user_pool_client_id)
VITE_COGNITO_REGION=$(tofu output -raw cognito_region)
VITE_APP_URL=https://$(tofu output -raw cloudfront_domain)
EOF

echo "Checkmark .env.production generated"

# 3. Build & Deploy
cd ../../app
npm run build
aws s3 sync dist/ s3://$(tofu output -raw spa_bucket_name) --delete

# 4. Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id $(tofu output -raw distribution_id) \
  --paths "/*"

echo "Checkmark Deployed!"