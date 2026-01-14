#!/bin/bash

# YogaSwap Deployment Script
# Führt alle notwendigen Build-Schritte aus und deployt auf AWS

set -e  # Exit bei Fehlern

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 YogaSwap Deployment Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Prüfen, ob ein Projektname übergeben wurde
if [ -z "$1" ]; then
    echo "📝 Kein Projektname angegeben."
    echo ""
    echo "Verwendung: $0 <projektname> [--skip-build] [--skip-plan]"
    echo ""
    echo "Beispiele:"
    echo "  $0 yogaswap-backend-demo-prod"
    echo "  $0 yogaswap-backend-demo-2025"
    echo "  $0 yogaswap-backend-demo-karin"
    echo ""
    echo "Optionen:"
    echo "  --skip-build    Überspringe Build-Schritte (nutze vorhandene Builds)"
    echo "  --skip-plan     Überspringe 'tofu plan' (führe direkt 'tofu apply' aus)"
    echo ""
    exit 1
fi

PROJECT_NAME="$1"
SKIP_BUILD=false
SKIP_PLAN=false

# Optionen parsen
for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --skip-plan)
            SKIP_PLAN=true
            ;;
    esac
done

echo "📦 Projektname: $PROJECT_NAME"
echo "   Bucket-Name wird: ${PROJECT_NAME}-site"
echo ""

# Prüfen, welches Tool verwendet werden soll
USE_TOFU=false
if command -v tofu &> /dev/null; then
    USE_TOFU=true
    TERRAFORM_CMD="tofu"
elif command -v terraform &> /dev/null; then
    TERRAFORM_CMD="terraform"
else
    echo "❌ Weder Terraform noch OpenTofu gefunden!"
    echo "   Bitte installiere eines der Tools:"
    echo "   brew install opentofu"
    echo "   oder"
    echo "   brew install hashicorp/tap/terraform"
    exit 1
fi

echo "✅ Verwende: $TERRAFORM_CMD"
echo ""

# Build-Schritte ausführen (falls nicht übersprungen)
if [ "$SKIP_BUILD" = false ]; then
    echo "🔨 Baue Projekt-Komponenten..."
    echo ""
    
    # Shared-Package bauen
    echo "1️⃣  Baue shared-Package..."
    cd "$PROJECT_ROOT/shared"
    if [ ! -d "node_modules" ]; then
        echo "   Installiere Abhängigkeiten..."
        npm install
    fi
    npm run build
    echo "✅ Shared-Package gebaut"
    echo ""
    
    # Backend bauen
    echo "2️⃣  Baue Backend..."
    cd "$PROJECT_ROOT/backend"
    if [ ! -d "node_modules" ]; then
        echo "   Installiere Abhängigkeiten..."
        npm install
    fi
    npm run build-lambdas
    npm run zip
    echo "✅ Backend gebaut und ZIPs erstellt"
    echo ""
    
    # Frontend bauen
    echo "3️⃣  Baue Frontend..."
    cd "$PROJECT_ROOT/app"
    if [ ! -d "node_modules" ]; then
        echo "   Installiere Abhängigkeiten..."
        npm install
    fi
    npm run build
    echo "✅ Frontend gebaut"
    echo ""
    
    echo "✅ Alle Build-Schritte abgeschlossen!"
    echo ""
else
    echo "⏭️  Überspringe Build-Schritte (--skip-build)"
    echo ""
fi

# Terraform-Konfiguration vorbereiten
cd "$PROJECT_ROOT/projects/yogaswap"

# Prüfen, ob terraform.tfvars existiert, sonst erstellen
if [ ! -f "terraform.tfvars" ]; then
    echo "📝 Erstelle terraform.tfvars..."
    cat > terraform.tfvars <<EOF
project = "$PROJECT_NAME"
region = "eu-central-1"
EOF
    echo "✅ terraform.tfvars erstellt mit Projektname: $PROJECT_NAME"
    echo ""
else
    # Prüfen, ob der Projektname bereits gesetzt ist
    CURRENT_PROJECT=$(grep "^project" terraform.tfvars 2>/dev/null | cut -d'"' -f2 || echo "")
    if [ -n "$CURRENT_PROJECT" ] && [ "$CURRENT_PROJECT" != "$PROJECT_NAME" ]; then
        echo "⚠️  terraform.tfvars existiert bereits mit anderem Projektnamen: $CURRENT_PROJECT"
        read -p "   Überschreiben? (j/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[JjYy]$ ]]; then
            # Aktualisiere nur die project-Zeile
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                sed -i '' "s/^project = .*/project = \"$PROJECT_NAME\"/" terraform.tfvars
            else
                # Linux
                sed -i "s/^project = .*/project = \"$PROJECT_NAME\"/" terraform.tfvars
            fi
            echo "✅ terraform.tfvars aktualisiert"
        else
            echo "ℹ️  Verwende vorhandenen Projektnamen: $CURRENT_PROJECT"
        fi
    else
        echo "✅ terraform.tfvars gefunden"
    fi
    echo ""
fi

# Terraform initialisieren (falls noch nicht geschehen)
if [ ! -d ".terraform" ]; then
    echo "🔧 Initialisiere Terraform/OpenTofu..."
    $TERRAFORM_CMD init
    echo ""
fi

# Plan ausführen (falls nicht übersprungen)
if [ "$SKIP_PLAN" = false ]; then
    echo "📋 Erstelle Deployment-Plan..."
    $TERRAFORM_CMD plan
    echo ""
    
    read -p "✅ Plan erstellt. Deployment ausführen? (j/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[JjYy]$ ]]; then
        echo "❌ Deployment abgebrochen"
        exit 0
    fi
else
    echo "⏭️  Überspringe Plan (--skip-plan)"
    echo ""
fi

# Apply ausführen
echo "🚀 Starte Deployment..."
echo ""
$TERRAFORM_CMD apply

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment abgeschlossen!"
echo ""
echo "📋 Outputs:"
$TERRAFORM_CMD output
echo ""
echo "🎉 Deine YogaSwap-Anwendung ist jetzt auf AWS verfügbar!"
echo ""

