#!/bin/bash

# YogaSwap Deployment Script
# Führt alle notwendigen Build-Schritte aus und deployt auf AWS

set -e  # Exit bei Fehlern

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 YogaSwap Deployment Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SKIP_BUILD=false
SKIP_PLAN=false
AUTO_APPROVE=false
OVERWRITE_TFVARS=false

# Optionen und optionalen Projektname parsen
PROJECT_NAME_ARG=""
for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --skip-plan)
            SKIP_PLAN=true
            ;;
        --auto-approve)
            AUTO_APPROVE=true
            ;;
        --overwrite-tfvars)
            OVERWRITE_TFVARS=true
            ;;
        -*)
            ;;
        *)
            [ -z "$PROJECT_NAME_ARG" ] && PROJECT_NAME_ARG="$arg"
            ;;
    esac
done

# Projektname: aus Argument oder aus bestehender terraform.tfvars
TFVARS_FILE="$SCRIPT_DIR/../projects/yogaswap/terraform.tfvars"
if [ -n "$PROJECT_NAME_ARG" ]; then
    PROJECT_NAME="$PROJECT_NAME_ARG"
elif [ -f "$TFVARS_FILE" ]; then
    PROJECT_NAME=$(grep "^project" "$TFVARS_FILE" 2>/dev/null | cut -d'"' -f2 || echo "")
    if [ -z "$PROJECT_NAME" ]; then
        echo "❌ In terraform.tfvars konnte kein 'project' gefunden werden."
        exit 1
    fi
    echo "📦 Projektname aus terraform.tfvars: $PROJECT_NAME"
else
    echo "📝 Kein Projektname angegeben und keine terraform.tfvars vorhanden."
    echo ""
    echo "Verwendung: $0 [<projektname>] [Optionen]"
    echo ""
    echo "  Ohne Projektname wird der Wert aus projects/yogaswap/terraform.tfvars verwendet (falls vorhanden)."
    echo ""
    echo "Optionen:"
    echo "  --skip-build        Überspringe Build-Schritte (nutze vorhandene Builds)"
    echo "  --skip-plan         Überspringe 'tofu plan' (führe direkt 'tofu apply' aus)"
    echo "  --auto-approve      Keine interaktiven Bestätigungen (Plan/Apply direkt ausführen)"
    echo "  --overwrite-tfvars  Bestehende terraform.tfvars mit Projektname überschreiben"
    echo ""
    echo "Beispiele:"
    echo "  $0                                    # Projekt aus tfvars, mit Bestätigungen"
    echo "  $0 <PROJECT_NAME>                     # Neues Projekt oder tfvars anlegen"
    echo "  $0 --auto-approve                     # Deploy ohne Rückfragen (z.B. CI)"
    echo ""
    exit 1
fi

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
    CURRENT_PROJECT=$(grep "^project" terraform.tfvars 2>/dev/null | cut -d'"' -f2 || echo "")
    if [ -n "$CURRENT_PROJECT" ] && [ "$CURRENT_PROJECT" != "$PROJECT_NAME" ]; then
        if [ "$OVERWRITE_TFVARS" = true ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^project = .*/project = \"$PROJECT_NAME\"/" terraform.tfvars
            else
                sed -i "s/^project = .*/project = \"$PROJECT_NAME\"/" terraform.tfvars
            fi
            echo "✅ terraform.tfvars mit Projektname $PROJECT_NAME aktualisiert (--overwrite-tfvars)"
        else
            echo "ℹ️  terraform.tfvars existiert mit Projektnamen: $CURRENT_PROJECT"
            echo "   Deployment verwendet diesen Namen. Zum Überschreiben: --overwrite-tfvars"
            PROJECT_NAME="$CURRENT_PROJECT"
        fi
    else
        echo "✅ terraform.tfvars gefunden (project = $PROJECT_NAME)"
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
    if [ "$AUTO_APPROVE" = false ]; then
        read -p "✅ Plan erstellt. Deployment ausführen? (j/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[JjYy]$ ]]; then
            echo "❌ Deployment abgebrochen"
            exit 0
        fi
    fi
else
    echo "⏭️  Überspringe Plan (--skip-plan)"
    echo ""
fi

# Apply ausführen
echo "🚀 Starte Deployment..."
echo ""
if [ "$AUTO_APPROVE" = true ]; then
    $TERRAFORM_CMD apply -auto-approve
else
    $TERRAFORM_CMD apply
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment abgeschlossen!"
echo ""
echo "📋 Outputs:"
$TERRAFORM_CMD output
echo ""
echo "🎉 Deine YogaSwap-Anwendung ist jetzt auf AWS verfügbar!"
echo ""

