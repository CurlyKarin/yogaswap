# YogaSwap

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat&logo=vite&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Serverless-FF9900?style=flat&logo=amazonaws&logoColor=white)
![Terraform](https://img.shields.io/badge/OpenTofu%2FTerraform-IaC-7B42BC?style=flat&logo=terraform&logoColor=white)

**Serverless-SaaS-Plattform für Yoga-Kursverwaltung und Kursplatz-Tausch**

YogaSwap ermöglicht Yogastudios die Verwaltung und den Tausch von Kursplätzen zwischen Teilnehmenden – inkl. automatischem Wartelisten-Management und rollenbasierter Zugriffskontrolle.

**▶ [Live-Demo ansehen](https://d1cvi2br361w6h.cloudfront.net)** *(Anmeldung erforderlich)*

---

## ✨ Features

- **Kursplatz-Tausch** – Teilnehmende können Kursplätze untereinander tauschen
- **Automatisches Wartelisten-Management** – Aufrückungen bei freien Plätzen
- **Rollenbasierte Zugriffe** – Admin, Instructor, Participant mit unterschiedlichen Rechten
- **Einladungssystem** – E-Mail-Einladungen für neue Nutzer (via AWS SES)
- **Responsive UI** – Nutzbar auf Desktop und mobilen Geräten

---

## 📋 Projektübersicht

YogaSwap ist eine vollständige Serverless-Webanwendung bestehend aus:
- **Frontend**: React/TypeScript SPA (Single Page Application)
- **Backend**: AWS Lambda-Funktionen (Serverless)
- **Infrastruktur**: DynamoDB, API Gateway, CloudFront, S3
- **Deployment**: Terraform/OpenTofu

---

## 📁 Projektstruktur

```
yogaswap/
├── app/                    # Frontend (React/TypeScript/Vite)
│   ├── src/
│   ├── .env.example       # Vorlage für Umgebungsvariablen
│   └── package.json
├── backend/               # Backend (Serverless Lambdas)
│   ├── src/
│   │   ├── lambdas/      # Lambda-Funktionen
│   │   ├── seed/         # Seed-Daten für DynamoDB
│   │   └── scripts/      # Helper-Scripts (createGroups, createAdminUser)
│   ├── zips/             # Lambda-ZIP-Dateien (werden beim Build erzeugt)
│   └── package.json
├── shared/                # Gemeinsame Typen und Utilities
│   └── src/
├── projects/              # Terraform/OpenTofu-Konfigurationen
│   └── yogaswap/
│       ├── main.tf, lambda.tf, dynamodb.tf, s3.tf, ...
│       └── terraform.tfvars.example
├── scripts/               # Deployment- und Setup-Scripts
└── README.md
```

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
- Cognito User Pool (für Benutzer-Authentifizierung)
- Cognito App Client und User Groups
- Lambda-Funktionen (12 verschiedene Funktionen, inkl. create-participants)
- API Gateway
- CloudFront Distribution
- S3-Bucket für das Frontend
- IAM-Rollen und -Policies

**Hinweis**: Beim ersten Deployment musst du die 3-Schritt-Anleitung aus `FRESH_SETUP.md` oder `projects/yogaswap/DEPLOYMENT_STEPS.md` befolgen.

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

**Option 1: Automatisch (empfohlen)**  
Wenn `projects/yogaswap/terraform.tfvars` vorhanden ist, wird der `project`-Wert automatisch übernommen:

```bash
cd backend
npm run seed
cd ..
```

**Option 2: Mit PROJECT_NAME**
```bash
cd backend
PROJECT_NAME="yogaswap-demo" npm run seed
cd ..
```

**Option 3: Tabellennamen direkt setzen**
```bash
cd backend
SWAPS_TABLE="yogaswap-demo-swaps-table" \
OVERRIDES_TABLE="yogaswap-demo-courseOverrides-table" \
COURSES_TABLE="yogaswap-demo-courses-table" \
npm run seed
cd ..
```

**Hinweis:** Die Tabellen müssen bereits in AWS existieren (nach Schritt 1 des Deployments).

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

**Wichtig für Cognito:** Wenn Cognito-Ressourcen bereits existieren, solltest du die Cognito-Environment-Variablen beim Build setzen:

```bash
cd app
VITE_COGNITO_USER_POOL_ID=$(cd ../projects/yogaswap && tofu output -raw cognito_user_pool_id) \
VITE_COGNITO_CLIENT_ID=$(cd ../projects/yogaswap && tofu output -raw cognito_user_pool_client_id) \
npm run build
cd ..
```

Alternativ kannst du eine `.env.production` Datei erstellen (wird automatisch von Vite beim Build verwendet):
```bash
cd app
cat > .env.production << EOF
VITE_COGNITO_USER_POOL_ID=$(cd ../projects/yogaswap && tofu output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(cd ../projects/yogaswap && tofu output -raw cognito_user_pool_client_id)
EOF
npm run build
cd ..
```

**Hinweis:** Die Region ist bereits in der User Pool ID enthalten (z.B. `eu-central-1_XXXXXXXXX`) und muss nicht separat gesetzt werden.

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

### App-Tests (Vitest)

Unit- und API-Tests im Frontend:

```bash
cd app
npm test
```

### E2E-Tests (Playwright)

End-to-End-Tests im Browser (Startseite, Impressum, ggf. erweiterbar mit Testuser-Login):

```bash
cd app
npm run test:e2e
```

Vor dem ersten Lauf ggf. Browser installieren: `npx playwright install chromium`.  
Details und geplante Erweiterungen: **[app/e2e/README.md](./app/e2e/README.md)**.

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

### Problem: "Cognito User Pool not found" oder Login funktioniert nicht

**Lösung**: 
1. Stelle sicher, dass Cognito beim Deployment erstellt wurde (siehe Schritt 2 im Deployment)
2. Prüfe, ob `.env.local` die korrekten Cognito-Werte enthält:
   ```bash
   cd projects/yogaswap
   tofu output cognito_user_pool_id
   tofu output cognito_user_pool_client_id
   ```
3. Vergleiche die Werte mit denen in `app/.env.local`
4. Stelle sicher, dass das Frontend neu gestartet wurde nach dem Erstellen von `.env.local`

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

## 🤝 Mitwirken

Ideen, Bug-Reports oder Pull Requests sind willkommen! Siehe [CONTRIBUTING.md](.github/CONTRIBUTING.md) für Hinweise.

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

---

## 🔐 AWS Cognito Setup

YogaSwap verwendet AWS Cognito für Benutzer-Authentifizierung. Die Cognito-Ressourcen werden automatisch beim Deployment mit Terraform erstellt.

**⚠️ Wichtiger Hinweis zur User-Verwaltung:**
- Der **Nickname** ist eindeutig und wird als Username in Cognito verwendet
- Die **E-Mail** kann mehrfach verwendet werden (z.B. mehrere User mit gleicher E-Mail-Adresse)
- Beim Login wird der **Nickname** verwendet, nicht die E-Mail

### Cognito-Konfiguration für lokale Entwicklung

**1. Cognito-Werte aus Terraform abrufen:**
```bash
cd projects/yogaswap
tofu output
```

Du solltest folgende Outputs sehen:
```
cognito_user_pool_id = "eu-central-1_XXXXXXXXX"
cognito_user_pool_client_id = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**2. `.env.local` für lokale Entwicklung erstellen:**

Erstelle `app/.env.local` (oder kopiere von `app/.env.example` falls vorhanden):
```bash
cd app
cat > .env.local << EOF
VITE_COGNITO_USER_POOL_ID=$(cd ../projects/yogaswap && tofu output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(cd ../projects/yogaswap && tofu output -raw cognito_user_pool_client_id)
EOF
```

**Oder manuell:**
Erstelle `app/.env.local` und trage die Werte ein:
```bash
VITE_COGNITO_USER_POOL_ID=eu-central-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Hinweis:** Die Region ist bereits in der User Pool ID enthalten (z.B. `eu-central-1_XXXXXXXXX`) und muss nicht separat gesetzt werden.

**3. Frontend lokal starten:**
```bash
npm run dev
```

Das Frontend läuft dann auf `http://localhost:5173` und kann mit Cognito authentifizieren.

### Cognito User Groups

Die Cognito User Groups werden **automatisch beim Deployment erstellt** (siehe Schritt 2 im Deployment):
- `admin` - Administratoren
- `instructor` - Instruktoren
- `participant` - Teilnehmer

**⚠️ Wichtig:** Falls die Groups aus irgendeinem Grund fehlen (z.B. bei älteren Deployments), musst du sie manuell erstellen:

```bash
# User Pool ID abrufen
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)

# User Groups erstellen
cd ../../backend
node scripts/createGroups.js $USER_POOL_ID
```

**Hinweis:** 
- Das Script verwendet `@aws-sdk/client-cognito-identity-provider`, das bereits als Dev-Dependency im `backend/package.json` enthalten ist.
- Das Script ist idempotent: Es erstellt nur fehlende Groups und ignoriert bereits existierende.

### Ersten Admin-User erstellen

**⚠️ Wichtig:** Nach dem ersten Deployment musst du den ersten Admin-User manuell erstellen, bevor du dich anmelden kannst.

**Option 1: Mit Initial-Setup-Script (empfohlen)**

```bash
# User Pool ID abrufen
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)

# Admin-User erstellen (mit Passwort - empfohlen)
cd ../../backend
node scripts/createAdminUser.js $USER_POOL_ID admin@example.com admin MeinPasswort123!
```

**⚠️ Wichtig:** 
- **Gib immer ein Passwort an** beim Erstellen des Admin-Users, damit das Passwort sofort permanent gesetzt wird
- Der **Nickname** (hier: `admin`) muss eindeutig sein und wird als Username verwendet
- Die **E-Mail** kann mehrfach verwendet werden (z.B. mehrere User mit gleicher E-Mail)
- Beim Login wird der **Nickname** verwendet, nicht die E-Mail

**Falls du kein Passwort angibst:**
Das Script generiert ein temporäres Passwort, das in der Konsole ausgegeben wird. Du musst dann:
1. Die `/invite` Seite verwenden oder
2. Beim ersten Login das Passwort ändern (wird zu `/change-password` weitergeleitet)

**Option 2: Mit AWS CLI (alternativ)**

```bash
# User Pool ID abrufen
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)

# Admin-User erstellen
# WICHTIG: --username ist der Nickname (muss eindeutig sein)
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true Name=nickname,Value=admin Name=custom:role,Value=admin \
  --message-action SUPPRESS \
  --temporary-password "MeinPasswort123!"

# User zur Admin-Gruppe hinzufügen
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --group-name admin

# Optional: Passwort permanent setzen (damit User nicht beim ersten Login ändern muss)
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --password "MeinPasswort123!" \
  --permanent
```

**Hinweis:** Der `--username` Parameter ist der Nickname (muss eindeutig sein). Die E-Mail kann mehrfach verwendet werden.

**Option 3: Über die AWS Console**

1. Gehe zur AWS Console → Cognito → User Pools
2. Wähle deinen User Pool aus
3. Klicke auf "Users" → "Create user"
4. **Username:** Gib den Nickname ein (muss eindeutig sein)
5. **Email:** Gib die E-Mail ein (kann mehrfach verwendet werden)
6. Setze ein temporäres Passwort
7. Nach dem Erstellen: Klicke auf den User → "Groups" → Füge zur Gruppe "admin" hinzu

**Hinweis:** Der Username in Cognito ist der Nickname (muss eindeutig sein). Die E-Mail kann mehrfach verwendet werden.

**Nach dem Erstellen des Admin-Users:**

1. Logge dich im Frontend ein:
   - Öffne die CloudFront-URL im Browser
   - Login mit Nickname und Passwort
2. Über das AdminPanel kannst du weitere User einladen (E-Mail-Versand erfordert konfiguriertes SES)

**⚠️ Hinweis zu E-Mails (SES):**
- Die Lambda-Funktion `createParticipants` versucht, E-Mails über SES zu versenden
- **SES Sandbox-Modus:** In diesem Modus können nur verifizierte E-Mail-Adressen E-Mails senden/empfangen
- **SES-Absender konfigurieren:** Setze `ses_source_email` in `terraform.tfvars` auf eine verifizierte E-Mail-Adresse
- **SES in Terraform:** IAM-Berechtigungen sind bereits konfiguriert. Die E-Mail-Adresse/Domain muss **manuell in AWS SES Console verifiziert werden** (siehe unten)

**Optionen für den Absender:**

1. **E-Mail-Adresse verifizieren (für Entwicklung/Test):**
   - AWS Console → SES → Verified identities → Create identity → Email address
   - E-Mail-Adresse eingeben und Verifizierungs-E-Mail bestätigen
   - Setze in `terraform.tfvars`: `ses_source_email = "deine-email@example.com"`
   - **Beispiel:** `ses_source_email = "yogaswap@example.com"`
   - **Wichtig:** Nach Änderung von `ses_source_email` muss die Lambda neu deployed werden:
     ```bash
     cd projects/yogaswap
     tofu apply
     ```
     Dies aktualisiert die Environment Variable `SES_SOURCE_EMAIL` in der `create-participants` Lambda-Funktion.
   - **Hinweis:** Die IAM-Berechtigungen sind bereits in Terraform konfiguriert, nur die Verifizierung muss manuell erfolgen

2. **Domain verifizieren (empfohlen für Produktion):**
   - AWS Console → SES → Verified identities → Create identity → Domain
   - Domain eingeben (z.B. `yogaswap.de`)
   - DNS-Einträge in deinem Domain-Provider hinzufügen (SES zeigt dir die Werte)
   - **Optional:** Nutze `projects/yogaswap/ses.tf` mit `aws_ses_domain_identity` für Terraform-Management
   - Dann kannst du alle E-Mails von dieser Domain senden (z.B. `yogaswap@yogaswap.de`, `support@yogaswap.de`)
   - **Vorteil:** Alle E-Mails von der Domain möglich, keine einzelne Adress-Verifizierung nötig

3. **Sandbox verlassen (für Produktion):**
   - AWS Console → SES → Request production access
   - Ermöglicht höhere Limits und keine Empfänger-Verifizierung

**Wichtig - Lambda nach SES-Konfiguration neu deployen:**
- Nach Änderung von `ses_source_email` in `terraform.tfvars` muss die Lambda-Funktion neu deployed werden:
  ```bash
  cd projects/yogaswap
  tofu apply
  ```
- Dies aktualisiert die Environment Variable `SES_SOURCE_EMAIL` in der `create-participants` Lambda-Funktion
- **Ohne `tofu apply` wird die neue E-Mail-Adresse nicht verwendet!**

**Problem: Lambda verwendet immer noch alte E-Mail-Adresse (z.B. `yogaswap@example.com`)**

Falls die Lambda immer noch die alte E-Mail-Adresse verwendet, obwohl du `ses_source_email` in `terraform.tfvars` gesetzt hast:

1. **Ist `ses_source_email` in `terraform.tfvars` korrekt gesetzt?**
   ```bash
   cd projects/yogaswap
   cat terraform.tfvars | grep ses_source_email
   ```
   Sollte deine verifizierte E-Mail-Adresse zeigen (nicht `yogaswap@example.com`).

2. **Wird die Variable von Terraform erkannt?**
   ```bash
   cd projects/yogaswap
   tofu plan | grep -i ses_source_email
   ```
   Sollte eine Änderung anzeigen, falls die Variable geändert wurde.

3. **Lambda Environment Variable in AWS überprüfen:**
   ```bash
   cd projects/yogaswap
   PROJECT_NAME=$(grep "^project" terraform.tfvars | cut -d'"' -f2)
   aws lambda get-function-configuration \
     --function-name "${PROJECT_NAME}-create-participants" \
     --query 'Environment.Variables.SES_SOURCE_EMAIL' \
     --output text
   ```
   Dies zeigt die tatsächlich gesetzte Environment Variable in AWS.

4. **Environment Variable in Lambda-Logs prüfen:**
   Die Lambda loggt jetzt automatisch alle Environment Variables. Nach dem Neu-Deployment:
   - Erstelle einen neuen User über das AdminPanel
   - Gehe zu AWS Console → CloudWatch → Log Groups
   - Suche nach `/aws/lambda/${PROJECT_NAME}-create-participants`
   - In den neuesten Logs findest du:
     ```
     Environment Variables: { SES_SOURCE_EMAIL: "...", ... }
     📧 Verwende SES Source Email: "..."
     ```
   Oder via AWS CLI:
   ```bash
   PROJECT_NAME=$(grep "^project" terraform.tfvars | cut -d'"' -f2)
   aws logs tail "/aws/lambda/${PROJECT_NAME}-create-participants" --follow --format short | grep -E "Environment Variables|SES Source Email"
   ```

5. **Falls die Variable nicht aktualisiert wurde:**

   **Problem:** Terraform erkennt die Änderung nicht, weil der State noch den alten Wert hat oder die `source_code_hash` Änderung noch nicht greift.
   
   **Lösung 1: Lambda explizit ersetzen (empfohlen, wenn `tofu plan` keine Änderung zeigt):**
   ```bash
   cd projects/yogaswap
   tofu apply -replace="aws_lambda_function.lambda[\"create_participants\"]"
   ```
   Das zwingt Terraform, die Lambda neu zu deployen und die Environment Variables zu aktualisieren.
   
   **Wichtig:** Wenn `tofu plan` keine Änderung für die Lambda zeigt (wie in deinem Fall), dann muss die Lambda explizit ersetzt werden!
   
   **Lösung 2: Lambda-Code leicht ändern (um source_code_hash zu ändern):**
   ```bash
   cd backend
   npm run build-lambdas
   npm run zip
   cd ../projects/yogaswap
   tofu apply
   ```
   
   **Lösung 3: State refreshen und prüfen:**
   ```bash
   cd projects/yogaswap
   tofu refresh
   tofu plan
   ```
   Prüfe, ob `tofu plan` jetzt eine Änderung anzeigt. Falls ja, führe `tofu apply` aus.

**Bis die E-Mail-Adresse verifiziert und deployed ist:**
- Wenn die E-Mail nicht versendet werden kann, zeigt das AdminPanel das temporäre Passwort an
- Du kannst es dann persönlich übermitteln

---

### 🔧 Passwort für existierenden Admin-User permanent setzen

**Falls dein Admin-User bereits erstellt wurde und das Passwort als temporär gesetzt ist:**

Du kannst das Passwort für einen existierenden User permanent setzen (damit keine Passwortänderung beim ersten Login erforderlich ist):

**Mit AWS CLI:**
```bash
# User Pool ID abrufen
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)

# Passwort permanent setzen
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin \
  --password "MeinPasswort123!" \
  --permanent
```

**Ersetze:**
- `admin` → Dein Nickname/Username
- `MeinPasswort123!` → Dein gewünschtes Passwort

**Nach diesem Befehl:** Du kannst dich direkt mit dem Passwort einloggen, ohne es ändern zu müssen!

**Alternative: Invite-Seite verwenden**
Falls du das temporäre Passwort kennst, kannst du auch die `/invite` Seite verwenden:
1. Öffne: `https://deine-cloudfront-url/invite?nickname=admin&email=admin@example.com`
2. Gib das temporäre Passwort ein
3. Setze ein neues Passwort

**Tipp:** Beim nächsten Mal gib beim Erstellen des Admin-Users immer ein Passwort an, damit es automatisch permanent gesetzt wird.
