# YogaSwap - Setup & Deployment Anleitung

Diese Anleitung führt dich durch die komplette Installation und das Deployment von YogaSwap auf AWS.

## 📋 Projektübersicht

YogaSwap ist eine vollständige Serverless-Webanwendung bestehend aus:
- **Frontend**: React/TypeScript SPA (Single Page Application)
- **Backend**: AWS Lambda-Funktionen (Serverless)
- **Infrastruktur**: DynamoDB, API Gateway, CloudFront, S3
- **Deployment**: Terraform/OpenTofu

---

## 🚀 Quick Start für neuen Rechner

**Du hast einen komplett frischen Rechner?** → Siehe **[FRESH_SETUP.md](./FRESH_SETUP.md)** für die komplette Schritt-für-Schritt-Anleitung!

---

## 🔧 Systemvoraussetzungen

Bevor du mit dem Setup beginnst, musst du folgende Tools auf deinem Rechner installieren:

### 1. Node.js (>= 20.x) und npm

**Wichtig:** Das Projekt verwendet Vite 7, das Node.js 20+ benötigt.

**macOS (mit Homebrew):**
```bash
brew install node@20
```

Falls du bereits Node.js 18 installiert hast, aktualisiere es:
```bash
brew uninstall node@18
brew install node@20
```

**Oder direkt von der Website:**
- Besuche [nodejs.org](https://nodejs.org/)
- Installiere die LTS-Version (mindestens 20.x)

**Verifizierung:**
```bash
node --version  # Sollte >= 20.0.0 sein
npm --version
```

### 2. Terraform oder OpenTofu

**Option A: Terraform (mit Homebrew):**
```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

**Option B: OpenTofu (empfohlen, Open-Source-Fork):**
```bash
brew install opentofu
```

**Verifizierung:**
```bash
terraform --version
# oder
tofu --version
```

### 3. AWS CLI

```bash
brew install awscli
```

**Verifizierung:**
```bash
aws --version
```

### 4. AWS Credentials konfigurieren

Du musst deine AWS-Zugangsdaten konfigurieren:

```bash
aws configure
```

Du wirst nach folgenden Informationen gefragt:
- **AWS Access Key ID**: Dein AWS Access Key
- **AWS Secret Access Key**: Dein AWS Secret Key
- **Default region name**: z.B. `eu-central-1` (Frankfurt)
- **Default output format**: `json`

**Hinweis**: Wenn du noch keinen Access Key hast, erstelle einen im AWS IAM Console:
1. Gehe zu AWS Console → IAM → Users
2. Wähle deinen Benutzer (oder erstelle einen)
3. Gehe zu "Security credentials" → "Create access key"
4. Speichere die Zugangsdaten sicher

### 5. Git (falls noch nicht installiert)

```bash
brew install git
```

**Verifizierung:**
```bash
git --version
```

---

## 🛠️ Nützliche Scripts

Das Projekt enthält mehrere Helper-Scripts im Verzeichnis `scripts/`:

### `check-setup.sh` - Setup-Überprüfung

Prüft, ob alle benötigten Tools installiert sind und ob das Projekt korrekt gebaut wurde:

```bash
./scripts/check-setup.sh
```

### `setup.sh` - Quick-Setup

Installiert alle Abhängigkeiten und baut das komplette Projekt:

```bash
./scripts/setup.sh
```

### `deploy.sh` - Automatisches Deployment

Führt alle Build-Schritte aus und deployt auf AWS:

```bash
./scripts/deploy.sh <projektname> [--skip-build] [--skip-plan]
```

**Beispiele:**
```bash
# Standard-Deployment
./scripts/deploy.sh yogaswap-backend-demo-karin

# Ohne vorherige Builds (nutzt vorhandene)
./scripts/deploy.sh yogaswap-backend-demo-karin --skip-build

# Direktes Apply ohne Plan
./scripts/deploy.sh yogaswap-backend-demo-karin --skip-plan
```

---

## 📦 Projekt-Setup

### Schnell-Setup (empfohlen)

Verwende das Setup-Script, um alle Abhängigkeiten automatisch zu installieren und zu bauen:

```bash
./scripts/setup.sh
```

Oder manuell:

### 1. Repository klonen (falls noch nicht geschehen)

```bash
cd /Users/karin/repos/yogaswap
```

### 2. Shared-Package bauen

Das Shared-Package wird von Frontend und Backend verwendet und muss zuerst gebaut werden:

```bash
cd shared
npm install
npm run build
cd ..
```

### 3. Backend-Abhängigkeiten installieren und bauen

```bash
cd backend
npm install
npm run build
cd ..
```

**Wichtig**: Das Backend muss gebaut werden, bevor die Lambda-ZIPs erstellt werden.

### 4. Lambda-ZIPs erstellen

```bash
cd backend
npm run build-lambdas
npm run zip
cd ..
```

Die ZIP-Dateien werden im Verzeichnis `backend/zips/` erstellt.

### 5. Frontend-Abhängigkeiten installieren

```bash
cd app
npm install
cd ..
```

### 6. Frontend bauen

```bash
cd app
npm run build
cd ..
```

Die gebauten Dateien werden im Verzeichnis `app/build/` erstellt.

**Tipp**: Nutze stattdessen `./scripts/setup.sh` für automatisches Setup!

---

## 🚀 AWS Deployment

### ⚠️ WICHTIG: Bucket-Namen konfigurieren

S3-Bucket-Namen müssen **global eindeutig** sein. Wenn du die Anwendung auf mehreren AWS-Accounts betreibst, musst du einen eindeutigen Projektnamen verwenden.

**Option 1: Automatisch mit Deployment-Script (empfohlen)**

Das Deployment-Script erstellt automatisch eine `terraform.tfvars` Datei:

```bash
./scripts/deploy.sh yogaswap-backend-demo-karin
```

**Option 2: Manuell konfigurieren**

1. Kopiere die Beispiel-Datei:
```bash
cd projects/yogaswap
cp terraform.tfvars.example terraform.tfvars
```

2. Bearbeite `terraform.tfvars` und setze einen eindeutigen Projektnamen:
```hcl
project = "yogaswap-backend-demo-karin"  # Ändere diesen Namen!
region = "eu-central-1"
```

Der Bucket-Name wird automatisch zu `${project}-site`, z.B. `yogaswap-backend-demo-karin-site`.

### Deployment durchführen

**Option A: Mit Deployment-Script (empfohlen)**

Das Script führt alle Build-Schritte aus und deployt automatisch:

```bash
./scripts/deploy.sh yogaswap-backend-demo-karin
```

**Optionen:**
- `--skip-build`: Überspringe Build-Schritte (nutze vorhandene Builds)
- `--skip-plan`: Überspringe Plan, führe direkt Apply aus

**Option B: Manuell**

**1. Setup prüfen:**
```bash
./scripts/check-setup.sh
```

**2. Terraform/OpenTofu initialisieren:**
```bash
cd projects/yogaswap
terraform init
# oder
tofu init
```

Dies lädt die benötigten Terraform-Provider (AWS) herunter.

**3. Deployment planen (optional, aber empfohlen):**
```bash
terraform plan
# oder
tofu plan
```

Dies zeigt dir, welche Ressourcen erstellt werden.

**4. Deployment ausführen:**
```bash
terraform apply
# oder
tofu apply
```

Du wirst nach einer Bestätigung gefragt. Gib `yes` ein.

**Wichtig**: Das Deployment kann einige Minuten dauern, da folgende Ressourcen erstellt werden:
- DynamoDB-Tabellen (Swaps, Course Overrides, Courses)
- Lambda-Funktionen (11 verschiedene Funktionen)
- API Gateway
- CloudFront Distribution
- S3-Bucket für das Frontend
- IAM-Rollen und -Policies

### 3. Outputs abrufen

Nach erfolgreichem Deployment zeigt Terraform/OpenTofu die wichtigen URLs:

```bash
Outputs:
api_endpoint = "https://xxx.execute-api.eu-central-1.amazonaws.com"
api_url = "https://xxx.execute-api.eu-central-1.amazonaws.com"
cloudfront_domain = "xxx.cloudfront.net"
spa_bucket_regional_name = "yogaswap-xxx.s3.eu-central-1.amazonaws.com"
```

Die **CloudFront-URL** ist deine Haupt-URL für die Anwendung!

### 4. DynamoDB mit Seed-Daten befüllen (optional)

Falls du Beispieldaten in DynamoDB laden möchtest:

```bash
cd backend
npm run seed:build
cd ..
```

---

## 🔄 Workflow bei Änderungen

### Frontend-Änderungen

1. Änderungen im `app/src/` Verzeichnis vornehmen
2. Frontend neu bauen:
   ```bash
   cd app
   npm run build
   cd ..
   ```
3. Terraform anwenden (CloudFront erkennt Änderungen automatisch):
   ```bash
   cd projects/yogaswap
   terraform apply
   cd ../..
   ```

### Backend-Änderungen (Lambda-Funktionen)

1. Änderungen im `backend/src/lambdas/` Verzeichnis vornehmen
2. Lambdas neu bauen:
   ```bash
   cd backend
   npm run build-lambdas
   npm run zip
   cd ..
   ```
3. Terraform anwenden:
   ```bash
   cd projects/yogaswap
   terraform apply
   cd ../..
   ```

### Shared-Package-Änderungen

Wenn du Typen oder gemeinsamen Code im `shared/` Verzeichnis änderst:

1. Shared-Package neu bauen:
   ```bash
   cd shared
   npm run build
   cd ..
   ```
2. Backend neu bauen:
   ```bash
   cd backend
   npm run build-lambdas
   npm run zip
   cd ..
   ```
3. Frontend neu bauen:
   ```bash
   cd app
   npm run build
   cd ..
   ```
4. Terraform anwenden:
   ```bash
   cd projects/yogaswap
   terraform apply
   cd ../..
   ```

---

## 🧪 Lokale Entwicklung

### Frontend lokal starten

```bash
cd app
npm run dev
```

Das Frontend läuft dann auf `http://localhost:5173` (oder einem anderen Port).

**Hinweis**: Für API-Aufrufe musst du einen Proxy konfigurieren oder die API-URL in der Vite-Konfiguration anpassen.

### Backend-Tests ausführen

```bash
cd backend
npm test
```

---

## 🗑️ Infrastruktur wieder abbauen

Um alle AWS-Ressourcen wieder zu löschen und Kosten zu sparen:

```bash
cd projects/yogaswap
terraform destroy
# oder
tofu destroy
```

**Achtung**: Dies löscht ALLE Ressourcen inklusive der Daten in DynamoDB!

---

## 📁 Projektstruktur

```
yogaswap/
├── app/                    # Frontend (React/TypeScript/Vite)
│   ├── src/
│   ├── build/             # Gebaute Frontend-Dateien (nach npm run build)
│   └── package.json
├── backend/               # Backend (Serverless Lambdas)
│   ├── src/
│   │   ├── lambdas/      # Lambda-Funktionen
│   │   └── seed/         # Seed-Daten für DynamoDB
│   ├── zips/             # Lambda-ZIP-Dateien
│   └── package.json
├── shared/                # Gemeinsame Typen und Utilities
│   └── src/
├── projects/              # Terraform-Konfigurationen
│   └── yogaswap/         # Haupt-Deployment-Konfiguration
│       ├── main.tf
│       ├── lambda.tf
│       ├── dynamodb.tf
│       ├── s3.tf
│       └── variables.tf
└── README.md
```

---

## 🐛 Häufige Probleme und Lösungen

### Problem: "terraform: command not found"

**Lösung**: Terraform/OpenTofu ist nicht installiert oder nicht im PATH. Siehe Installationsschritte oben.

### Problem: "AWS credentials not found"

**Lösung**: Führe `aws configure` aus und gib deine AWS-Zugangsdaten ein.

### Problem: "Access Denied" beim Terraform Apply

**Lösung**: Dein AWS-User benötigt folgende Berechtigungen:
- DynamoDB (Create, Read, Write, Delete Tables)
- Lambda (Create, Update, Delete Functions)
- API Gateway (Create, Update APIs)
- CloudFront (Create, Update Distributions)
- S3 (Create, Upload, Manage Buckets)
- IAM (Create Roles und Policies)

### Problem: "ZIP-Datei nicht gefunden" beim Terraform Apply

**Lösung**: Stelle sicher, dass du die Lambda-ZIPs erstellt hast:
```bash
cd backend
npm run build-lambdas
npm run zip
```

### Problem: Frontend zeigt keine Daten an

**Lösung**: 
1. Prüfe, ob die DynamoDB-Tabellen mit Daten befüllt sind (siehe Seed-Daten)
2. Prüfe die Browser-Console auf Fehler
3. Prüfe, ob die CloudFront-Distribution korrekt konfiguriert ist

### Problem: "Module not found" Fehler bei npm install

**Lösung**: Stelle sicher, dass du in allen Verzeichnissen (`shared/`, `backend/`, `app/`) `npm install` ausgeführt hast.

---

## 📝 Wichtige Hinweise

### Kosten

- **DynamoDB**: Kosten entstehen nur bei tatsächlichem Traffic (Free Tier verfügbar)
- **Lambda**: 1 Million kostenlose Anfragen pro Monat (Free Tier)
- **CloudFront**: Erste 1 TB Datenübertragung kostenlos (Free Tier)
- **S3**: 5 GB kostenloser Speicher (Free Tier)
- **API Gateway**: Erste 1 Million API-Aufrufe kostenlos (Free Tier)

**Tipp**: Nutze `terraform destroy`, wenn du die Infrastruktur nicht mehr benötigst.

### Sicherheit

- Die AWS-Credentials sollten **nie** ins Repository committed werden
- Verwende IAM-User mit **minimalen notwendigen Berechtigungen**
- Für Produktion: Nutze separate AWS-Accounts oder Environments

### Region

Das Projekt verwendet standardmäßig `eu-central-1` (Frankfurt). Du kannst die Region in `projects/yogaswap/variables.tf` ändern.

---

## 🔗 Nützliche Links

- [AWS Console](https://console.aws.amazon.com/)
- [Terraform Dokumentation](https://www.terraform.io/docs)
- [OpenTofu Dokumentation](https://opentofu.org/docs)
- [AWS Lambda Dokumentation](https://docs.aws.amazon.com/lambda/)

---

## 💡 Nächste Schritte

Nach erfolgreichem Deployment:

1. **Seed-Daten laden**: Befülle DynamoDB mit Beispieldaten
2. **URL testen**: Öffne die CloudFront-URL im Browser
3. **Monitoring einrichten**: Nutze CloudWatch für Logs und Metriken
4. **Custom Domain** (optional): Konfiguriere eine eigene Domain für CloudFront

---

Viel Erfolg mit YogaSwap! 🧘‍♀️
