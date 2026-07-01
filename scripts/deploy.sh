#!/bin/bash

# YogaSwap Deployment Script (workspace-aware, #245)
#
# Aufruf:
#   ./scripts/deploy.sh <env> [--skip-build] [--skip-plan] [--auto-approve]
#
#   <env> = OpenTofu-Workspace, z. B. "staging", "prod" oder "default" (= demo).
#
# Das Script leitet ALLES aus dem Workspace ab (Single Source: env.tf):
#   - Projektname (local.project) -> nur Anzeige/Seeds
#   - Frontend-Build-Modus wird an den Workspace gekoppelt
#     (default-Workspace -> vite --mode demo + app/.env.demo; prod/staging -> --mode <env>)
# So kann kein prod-Frontend versehentlich nach staging gelangen (und umgekehrt).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$PROJECT_ROOT/projects/yogaswap"

echo "🚀 YogaSwap Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SKIP_BUILD=false
SKIP_PLAN=false
AUTO_APPROVE=false
ENV_ARG=""

for arg in "$@"; do
    case $arg in
        --skip-build)   SKIP_BUILD=true ;;
        --skip-plan)    SKIP_PLAN=true ;;
        --auto-approve) AUTO_APPROVE=true ;;
        -*)             echo "⚠️  Unbekannte Option ignoriert: $arg" ;;
        *)              [ -z "$ENV_ARG" ] && ENV_ARG="$arg" ;;
    esac
done

usage() {
    echo "Verwendung: $0 <env> [Optionen]"
    echo ""
    echo "  <env>  OpenTofu-Workspace (z. B. 'staging', 'prod' oder 'default' = demo)"
    echo ""
    echo "Optionen:"
    echo "  --skip-build    Build überspringen (⚠️ nur sinnvoll, wenn der letzte"
    echo "                  Build zur selben <env> gehörte – sonst falsches Bundle!)"
    echo "  --skip-plan     'tofu plan' überspringen, direkt 'apply'"
    echo "  --auto-approve  Keine Rückfragen (z. B. CI)"
    echo ""
    echo "Beispiele:"
    echo "  $0 staging                 # staging bauen + deployen"
    echo "  $0 prod                    # prod bauen + deployen"
    echo "  $0 default                 # demo bauen + deployen"
    echo "  $0 staging --auto-approve  # ohne Rückfrage"
}

if [ -z "$ENV_ARG" ]; then
    echo "❌ Kein Environment angegeben."
    echo ""
    usage
    exit 1
fi
ENV="$ENV_ARG"

# OpenTofu/Terraform ermitteln
if command -v tofu &> /dev/null; then
    TERRAFORM_CMD="tofu"
elif command -v terraform &> /dev/null; then
    TERRAFORM_CMD="terraform"
else
    echo "❌ Weder OpenTofu (tofu) noch Terraform gefunden. Installiere z. B.: brew install opentofu"
    exit 1
fi

cd "$TF_DIR"

# Initialisieren (falls nötig)
if [ ! -d ".terraform" ]; then
    echo "🔧 Initialisiere $TERRAFORM_CMD..."
    $TERRAFORM_CMD init -input=false
    echo ""
fi

# Workspace muss existieren (kein Auto-Create -> kein versehentliches Anlegen)
if ! $TERRAFORM_CMD workspace list | sed 's/[*]//g' | tr -d ' ' | grep -qx "$ENV"; then
    echo "❌ Workspace '$ENV' existiert nicht."
    echo "   Vorhandene Workspaces:"
    $TERRAFORM_CMD workspace list | sed 's/^/     /'
    echo "   Neu anlegen (einmalig):  $TERRAFORM_CMD -chdir=$TF_DIR workspace new $ENV"
    echo "   und env.$ENV.json anlegen (Vorlage: env.$ENV.json.example)."
    exit 1
fi

$TERRAFORM_CMD workspace select "$ENV"

# Sensible Env-Datei muss vorhanden sein (env.tf liest sie)
if [ ! -f "env.$ENV.json" ]; then
    echo "❌ env.$ENV.json fehlt (Vorlage: env.$ENV.json.example). Ohne diese Datei kann env.tf nicht ausgewertet werden."
    exit 1
fi

# Projektname aus der Single Source (env.tf) ableiten
PROJECT_NAME=$(echo 'local.project' | $TERRAFORM_CMD console 2>/dev/null | tr -d '"' | tr -d '\r' | head -n1 | xargs)
if [ -z "$PROJECT_NAME" ]; then
    echo "❌ Projektname konnte nicht aus env.tf ($ENV) ermittelt werden."
    exit 1
fi

echo "✅ Tool:        $TERRAFORM_CMD"
echo "✅ Environment: $ENV"
echo "✅ Projekt:     $PROJECT_NAME"
echo ""

# Build-Schritte
if [ "$SKIP_BUILD" = false ]; then
    echo "🔨 Baue Komponenten..."
    echo ""

    echo "1️⃣  shared..."
    cd "$PROJECT_ROOT/shared"
    [ -d node_modules ] || npm install
    npm run build
    echo ""

    echo "2️⃣  backend (Lambdas + ZIPs)..."
    cd "$PROJECT_ROOT/backend"
    [ -d node_modules ] || npm install
    npm run build-lambdas
    npm run zip
    echo ""

    echo "3️⃣  frontend (Modus an '$ENV' gekoppelt)..."
    cd "$PROJECT_ROOT/app"
    [ -d node_modules ] || npm install

    # OpenTofu-Workspace != Vite-Modus: default (demo) nutzt --mode demo (#253).
    case "$ENV" in
        default) VITE_MODE="demo" ;;
        *)       VITE_MODE="$ENV" ;;
    esac

    if [ ! -f ".env.$VITE_MODE" ]; then
        echo "❌ app/.env.$VITE_MODE fehlt – der Frontend-Build für '$ENV' braucht diese Datei"
        if [ "$VITE_MODE" = "demo" ] && [ -f ".env.production" ]; then
            echo "   Tipp: Alte Demo-Datei umbenennen: mv .env.production .env.demo"
        fi
        echo "   (sonst würden falsche Cognito-Werte eingebacken)."
        exit 1
    fi
    npm run build -- --mode "$VITE_MODE"
    echo ""

    cd "$TF_DIR"
    echo "✅ Build abgeschlossen"
    echo ""
else
    echo "⏭️  Build übersprungen (--skip-build)"
    echo "    ⚠️  Es wird der zuletzt gebaute Stand aus app/build hochgeladen."
    echo "        Stelle sicher, dass dieser zur Umgebung '$ENV' passt!"
    echo ""
fi

# Plan + EINE Bestätigung (danach appliziert tofu ohne erneute Rückfrage)
if [ "$AUTO_APPROVE" = false ]; then
    if [ "$SKIP_PLAN" = false ]; then
        echo "📋 Plan ($ENV)..."
        $TERRAFORM_CMD plan -input=false
        echo ""
    fi
    read -p "✅ Deployment nach '$ENV' ausführen? (j/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[JjYy]$ ]]; then
        echo "❌ Abgebrochen"
        exit 0
    fi
fi

# Apply – Bestätigung ist oben bereits erfolgt, daher kein zweiter tofu-Prompt.
echo "🚀 Apply ($ENV)..."
echo ""
$TERRAFORM_CMD apply -auto-approve -input=false

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment '$ENV' abgeschlossen!"
echo ""
echo "📋 Outputs:"
$TERRAFORM_CMD output
echo ""
