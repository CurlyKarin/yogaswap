#!/bin/bash

# YogaSwap Setup-Check Script
# Prüft, ob alle benötigten Tools installiert sind

echo "🔍 YogaSwap Setup-Check wird durchgeführt..."
echo ""

ERRORS=0
WARNINGS=0

# Funktion zum Prüfen von Befehlen
check_command() {
    local cmd=$1
    local name=$2
    local required=$3
    
    if command -v $cmd &> /dev/null; then
        local version=$($cmd --version 2>&1 | head -n 1)
        echo "✅ $name: $version"
        return 0
    else
        if [ "$required" = "required" ]; then
            echo "❌ $name: NICHT INSTALLIERT (erforderlich)"
            ERRORS=$((ERRORS + 1))
        else
            echo "⚠️  $name: NICHT INSTALLIERT (optional)"
            WARNINGS=$((WARNINGS + 1))
        fi
        return 1
    fi
}

# Funktion zum Prüfen von Node.js-Version
check_node_version() {
    if command -v node &> /dev/null; then
        local version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$version" -ge 22 ]; then
            echo "✅ Node.js Version: $(node --version) (OK, Projekt .nvmrc: 22)"
            return 0
        else
            echo "❌ Node.js Version: $(node --version) (Benötigt >= 22.0.0)"
            echo "   Siehe .nvmrc / README. z. B. brew install node@22 oder nvm install"
            ERRORS=$((ERRORS + 1))
            return 1
        fi
    else
        echo "❌ Node.js: NICHT INSTALLIERT (erforderlich)"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

# Node.js prüfen
echo "📦 Runtime & Tools:"
check_node_version
check_command "npm" "npm" "required"
echo ""

# Terraform/OpenTofu prüfen
echo "🏗️  Infrastructure Tools:"
HAS_TERRAFORM=false
if check_command "terraform" "Terraform" "optional"; then
    HAS_TERRAFORM=true
fi
if check_command "tofu" "OpenTofu" "optional"; then
    HAS_TERRAFORM=true
fi
if [ "$HAS_TERRAFORM" = false ]; then
    echo "❌ Weder Terraform noch OpenTofu gefunden (mindestens eines erforderlich)"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# AWS CLI prüfen
echo "☁️  AWS Tools:"
if check_command "aws" "AWS CLI" "required"; then
    # AWS Credentials prüfen
    if aws sts get-caller-identity &> /dev/null; then
        local aws_account=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
        local aws_user=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null)
        echo "✅ AWS Credentials: Konfiguriert (Account: $aws_account)"
        echo "   User/Role: $aws_user"
    else
        echo "⚠️  AWS Credentials: Nicht konfiguriert oder ungültig"
        echo "   Führe 'aws configure' aus"
        WARNINGS=$((WARNINGS + 1))
    fi
fi
echo ""

# Git prüfen (optional)
echo "📚 Version Control:"
check_command "git" "Git" "optional"
echo ""

# Projekt-Abhängigkeiten prüfen
echo "📁 Projekt-Abhängigkeiten:"
if [ -d "shared/node_modules" ]; then
    echo "✅ shared/node_modules: Installiert"
else
    echo "⚠️  shared/node_modules: Nicht installiert (führe 'cd shared && npm install' aus)"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "backend/node_modules" ]; then
    echo "✅ backend/node_modules: Installiert"
else
    echo "⚠️  backend/node_modules: Nicht installiert (führe 'cd backend && npm install' aus)"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "app/node_modules" ]; then
    echo "✅ app/node_modules: Installiert"
else
    echo "⚠️  app/node_modules: Nicht installiert (führe 'cd app && npm install' aus)"
    WARNINGS=$((WARNINGS + 1))
fi

# Build-Status prüfen
echo ""
echo "🔨 Build-Status:"
if [ -d "shared/dist" ]; then
    echo "✅ shared/dist: Gebaut"
else
    echo "⚠️  shared/dist: Nicht gebaut (führe 'cd shared && npm run build' aus)"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "backend/zips" ] && [ "$(ls -A backend/zips/*.zip 2>/dev/null)" ]; then
    echo "✅ backend/zips: Lambda-ZIPs vorhanden"
else
    echo "⚠️  backend/zips: Keine ZIPs vorhanden (führe 'cd backend && npm run build-lambdas && npm run zip' aus)"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "app/build" ] && [ "$(ls -A app/build 2>/dev/null)" ]; then
    echo "✅ app/build: Frontend gebaut"
else
    echo "⚠️  app/build: Frontend nicht gebaut (führe 'cd app && npm run build' aus)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Zusammenfassung:"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ Alles OK! Du kannst mit dem Deployment beginnen."
    echo ""
    echo "Nächste Schritte:"
    echo "1. cd projects/yogaswap"
    echo "2. terraform init  (oder: tofu init)"
    echo "3. terraform apply (oder: tofu apply)"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  $WARNINGS Warnung(en) - Du kannst fortfahren, aber einige Schritte fehlen noch."
    exit 0
else
    echo "❌ $ERRORS Fehler gefunden - Bitte behebe diese zuerst."
    echo "⚠️  $WARNINGS Warnung(en) zusätzlich"
    exit 1
fi

