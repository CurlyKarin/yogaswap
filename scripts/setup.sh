#!/bin/bash

# YogaSwap Quick-Setup Script
# Installiert alle Abhängigkeiten und baut das Projekt

set -e  # Exit bei Fehlern

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔧 YogaSwap Quick-Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Prüfen, ob Node.js installiert ist
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ist nicht installiert!"
    echo ""
    echo "Bitte installiere Node.js (>= 18.x):"
    echo "  brew install node@18"
    echo ""
    exit 1
fi

# Node.js-Version prüfen
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js Version $(node --version) ist zu alt. Benötigt >= 18.0.0"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"
echo ""

# Shared-Package
echo "📦 Installiere shared-Package..."
cd "$PROJECT_ROOT/shared"
if [ -d "node_modules" ]; then
    echo "   node_modules existiert bereits, aktualisiere..."
    npm install
else
    npm install
fi
npm run build
echo "✅ Shared-Package fertig"
echo ""

# Backend
echo "📦 Installiere Backend..."
cd "$PROJECT_ROOT/backend"
if [ -d "node_modules" ]; then
    echo "   node_modules existiert bereits, aktualisiere..."
    npm install
else
    npm install
fi
echo "✅ Backend-Abhängigkeiten installiert"
echo ""

# Frontend
echo "📦 Installiere Frontend..."
cd "$PROJECT_ROOT/app"
if [ -d "node_modules" ]; then
    echo "   node_modules existiert bereits, aktualisiere..."
    npm install
else
    npm install
fi
echo "✅ Frontend-Abhängigkeiten installiert"
echo ""

# Backend bauen
echo "🔨 Baue Backend..."
cd "$PROJECT_ROOT/backend"
npm run build-lambdas
npm run zip
echo "✅ Backend gebaut und ZIPs erstellt"
echo ""

# Frontend bauen
echo "🔨 Baue Frontend..."
cd "$PROJECT_ROOT/app"
npm run build
echo "✅ Frontend gebaut"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup abgeschlossen!"
echo ""
echo "Nächste Schritte:"
echo ""
echo "1. Prüfe dein Setup:"
echo "   ./scripts/check-setup.sh"
echo ""
echo "2. Deploye auf AWS:"
echo "   ./scripts/deploy.sh <projektname>"
echo "   z.B.: ./scripts/deploy.sh yogaswap-backend-demo-karin"
echo ""
echo "3. Oder manuell:"
echo "   cd projects/yogaswap"
echo "   # Bearbeite terraform.tfvars mit deinem Projektnamen"
echo "   tofu init"
echo "   tofu apply"
echo ""

