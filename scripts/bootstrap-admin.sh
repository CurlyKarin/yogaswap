#!/bin/bash

# YogaSwap Erst-Admin-Bootstrap fuer eine Umgebung (#245)
#
# Legt fuer eine frische Umgebung alles an, was der erste Admin braucht:
#   1. Cognito-Gruppen (admin/instructor/participant)
#   2. Admin-User in Cognito
#   3. default-tenant + UserTenantMembership (role=admin) via create-tenant (#53)
#      -> ohne die Membership kann der Admin keine Teilnehmer verwalten
#
# Alle umgebungsabhaengigen Werte (Projektname, Cognito-Pool, Region) werden aus
# dem OpenTofu-Workspace abgeleitet (Single Source: env.tf + tofu outputs).
# Voraussetzung: Die Umgebung wurde zuvor deployt (tofu state vorhanden).
#
# Aufruf:
#   ./scripts/bootstrap-admin.sh <env> <email> <nickname> [password]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$PROJECT_ROOT/projects/yogaswap"

ENV="$1"
EMAIL="$2"
NICKNAME="$3"
PASSWORD="$4"

if [ -z "$ENV" ] || [ -z "$EMAIL" ] || [ -z "$NICKNAME" ]; then
    echo "Verwendung: $0 <env> <email> <nickname> [password]"
    echo "  z. B.: $0 staging admin@example.com admin"
    exit 1
fi

if command -v tofu &> /dev/null; then
    TERRAFORM_CMD="tofu"
elif command -v terraform &> /dev/null; then
    TERRAFORM_CMD="terraform"
else
    echo "❌ Weder OpenTofu (tofu) noch Terraform gefunden."
    exit 1
fi

cd "$TF_DIR"
$TERRAFORM_CMD workspace select "$ENV"

PROJECT_NAME=$(echo 'local.project' | $TERRAFORM_CMD console 2>/dev/null | tr -d '"' | tr -d '\r' | head -n1 | xargs)
POOL_ID=$($TERRAFORM_CMD output -raw cognito_user_pool_id 2>/dev/null || true)
REGION=$($TERRAFORM_CMD output -raw cognito_region 2>/dev/null || echo "eu-central-1")

if [ -z "$PROJECT_NAME" ] || [ -z "$POOL_ID" ]; then
    echo "❌ Konnte Projektname/Cognito-Pool für '$ENV' nicht ermitteln."
    echo "   Wurde die Umgebung schon deployt (tofu apply)?"
    exit 1
fi

TENANT_ID="default-tenant"

echo "🔧 Admin-Bootstrap"
echo "   Environment: $ENV"
echo "   Projekt:     $PROJECT_NAME"
echo "   Cognito:     $POOL_ID ($REGION)"
echo "   Admin:       $NICKNAME <$EMAIL>"
echo ""

echo "1️⃣  Cognito-Gruppen..."
( cd "$PROJECT_ROOT/backend" && node scripts/createGroups.js "$POOL_ID" )
echo ""

echo "2️⃣  Admin-User..."
if [ -n "$PASSWORD" ]; then
    ( cd "$PROJECT_ROOT/backend" && node scripts/createAdminUser.js "$POOL_ID" "$EMAIL" "$NICKNAME" "$PASSWORD" )
else
    ( cd "$PROJECT_ROOT/backend" && node scripts/createAdminUser.js "$POOL_ID" "$EMAIL" "$NICKNAME" )
fi
echo ""

echo "3️⃣  Tenant + Admin-Membership (role=admin)..."
( cd "$PROJECT_ROOT/backend" && PROJECT_NAME="$PROJECT_NAME" AWS_REGION="$REGION" \
    npm run create-tenant -- --tenant "$TENANT_ID" --name "YogaSwap" --admin-nickname "$NICKNAME" )
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Admin-Bootstrap für '$ENV' abgeschlossen."
