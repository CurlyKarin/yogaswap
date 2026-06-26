# 🚀 Komplette Einrichtung auf einem frischen Rechner

Diese Anleitung führt dich durch die komplette Einrichtung von YogaSwap auf einem neuen Rechner.

---

## 📋 Schritt 1: Homebrew installieren (falls noch nicht vorhanden)

Homebrew ist ein Paketmanager für macOS, der das Installieren von Tools vereinfacht.

**Prüfen, ob Homebrew installiert ist:**
```bash
brew --version
```

**Falls nicht installiert:**
1. Öffne ein Terminal
2. Kopiere und führe aus:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
3. Folge den Anweisungen auf dem Bildschirm
4. **Wichtig:** Nach der Installation musst du deine Shell neu laden:
```bash
source ~/.zshrc
```

---

## 📦 Schritt 2: Node.js 22 (LTS) installieren

**Installieren:**
```bash
brew install node@22
```

**Shell neu laden (falls nötig):**
```bash
source ~/.zshrc
```

**Verifizieren:**
```bash
node --version   # Sollte v22.x.x sein (Projekt: .nvmrc)
npm --version    # Sollte eine Version zeigen
```

**Tipp:** Falls du bereits Node.js 18 hast, erst deinstallieren:
```bash
brew uninstall node@18
```

---

## 🏗️ Schritt 3: OpenTofu installieren

OpenTofu ist ein Open-Source-Fork von Terraform und wird zum Deployen der AWS-Infrastruktur verwendet.

**Installieren:**
```bash
brew install opentofu
```

**Verifizieren:**
```bash
tofu --version
```

Sollte etwas wie `OpenTofu v1.x.x` anzeigen.

---

## ☁️ Schritt 4: AWS CLI installieren

Die AWS CLI wird benötigt, um dich bei AWS zu authentifizieren und Ressourcen zu verwalten.

**Installieren:**
```bash
brew install awscli
```

**Verifizieren:**
```bash
aws --version
```

---

## 🔑 Schritt 5: AWS Account einrichten

### 5.1 AWS Access Keys erstellen

1. **Gehe zur AWS Console:**
   - Öffne [https://console.aws.amazon.com/](https://console.aws.amazon.com/)
   - Logge dich mit deinem AWS-Account ein

2. **IAM Console öffnen:**
   - Suche nach "IAM" in der Suchleiste
   - Klicke auf "IAM" → "Users"

3. **Benutzer erstellen (falls noch nicht vorhanden):**
   - Klicke auf "Create user"
   - Wähle einen Namen (z.B. "yogaswap-deployment")
   - Klicke auf "Next"

4. **Berechtigungen vergeben:**
   - Wähle "Attach policies directly"
   - Suche und wähle: **"AdministratorAccess"** (für den Anfang - später kann man eingrenzen)
   - ODER wähle spezifische Policies:
     - `AmazonDynamoDBFullAccess`
     - `AWSLambda_FullAccess`
     - `AmazonAPIGatewayAdministrator`
     - `AmazonS3FullAccess`
     - `CloudFrontFullAccess`
     - `IAMFullAccess`
   - Klicke auf "Next" → "Create user"

5. **Access Keys erstellen:**
   - Klicke auf den erstellten Benutzer
   - Gehe zu Tab "Security credentials"
   - Scrolle zu "Access keys"
   - Klicke auf "Create access key"
   - Wähle "Command Line Interface (CLI)"
   - Setze ein Häkchen bei "I understand..."
   - Klicke auf "Next"
   - Optional: Beschreibung hinzufügen (z.B. "YogaSwap Deployment")
   - Klicke auf "Create access key"

6. **Keys speichern:**
   - **WICHTIG:** Kopiere dir beide Werte sofort:
     - **Access Key ID** (z.B. `AKIAIOSFODNN7EXAMPLE`)
     - **Secret Access Key** (z.B. `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)
   - Du kannst den Secret Key später nicht mehr ansehen!
   - Speichere sie sicher (z.B. in einem Passwort-Manager)

### 5.2 AWS CLI konfigurieren

**Im Terminal ausführen:**
```bash
aws configure
```

Du wirst nach 4 Werten gefragt:

1. **AWS Access Key ID:**
   ```
   AKIAIOSFODNN7EXAMPLE
   ```
   → Füge deinen Access Key ID ein (Enter)

2. **AWS Secret Access Key:**
   ```
   wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   ```
   → Füge deinen Secret Access Key ein (Enter)

3. **Default region name:**
   ```
   eu-central-1
   ```
   → Empfohlen: `eu-central-1` (Frankfurt) oder `us-east-1` (N. Virginia) (Enter)

4. **Default output format:**
   ```
   json
   ```
   → Einfach Enter drücken (json ist Standard)

**Verifizieren, dass es funktioniert:**
```bash
aws sts get-caller-identity
```

Sollte deinen AWS Account-ID und User-ARN anzeigen.

---

## 📥 Schritt 6: Projekt herunterladen/klonen

**Falls das Projekt schon lokal ist:**
```bash
cd /Users/karin/repos/yogaswap
```

**Falls du es noch klonen musst:**
```bash
cd ~/repos  # oder wo auch immer du deine Projekte speichern willst
git clone <dein-repository-url>
cd yogaswap
```

---

## 🔧 Schritt 7: Projekt-Abhängigkeiten installieren

**Schnell-Setup (empfohlen):**
```bash
./scripts/setup.sh
```

**Oder manuell:**

1. **Shared-Package:**
```bash
cd shared
npm install
npm run build
cd ..
```

2. **Backend:**
```bash
cd backend
npm install
npm run build-lambdas
npm run zip
cd ..
```

3. **Frontend:**
```bash
cd app
npm install
npm run build
cd ..
```

---

## ✅ Schritt 8: Setup prüfen

Führe das Check-Script aus:
```bash
./scripts/check-setup.sh
```

Alle Checks sollten ✅ grün sein. Falls nicht, behebe die angezeigten Probleme.

---

## 🎯 Schritt 9: Projekt für deinen AWS Account konfigurieren

### 9.1 Projektname festlegen

S3-Bucket-Namen müssen **global eindeutig** sein. Wähle einen eindeutigen Namen:

```bash
cd projects/yogaswap
cp terraform.tfvars.example terraform.tfvars
```

**Bearbeite `terraform.tfvars`** und setze deinen Projektnamen:
```hcl
project = "yogaswap-backend-demo-karin"  # Ändere zu deinem Namen!
region  = "eu-central-1"
```

**Beispiele für eindeutige Namen:**
- `yogaswap-backend-demo-2025`
- `yogaswap-backend-demo-karin`
- `yogaswap-backend-demo-prod`
- `yogaswap-backend-demo-<dein-name>`

---

## 🚀 Schritt 10: Terraform initialisieren

**Zum Terraform-Verzeichnis wechseln:**
```bash
cd projects/yogaswap
```

**Terraform initialisieren:**
```bash
tofu init
```

Dies lädt die benötigten Provider herunter (kann 1-2 Minuten dauern).

Du solltest sehen:
```
Initializing provider plugins...
Terraform has been successfully initialized!
```

---

## 📋 Schritt 11: Deployment planen und ausführen (in 3 Schritten)

**⚠️ WICHTIG:** Beim ersten Deployment musst du in 3 Schritten vorgehen, da es zirkuläre Abhängigkeiten gibt zwischen S3-Bucket und CloudFront.

### Schritt 11.1: DynamoDB-Tabellen und S3-Bucket erstellen

Zuerst erstellen wir die DynamoDB-Tabellen (die später von den Lambda-Funktionen benötigt werden) und das S3-Bucket (das vor CloudFront existieren muss):

```bash
tofu apply -target=module.swaps_table -target=module.course_overrides_table -target=module.courses_table -target=module.spa_site
```

**Was passiert:**
- Erstellt 3 DynamoDB-Tabellen (Swaps, Course Overrides, Courses)
- Erstellt S3-Bucket für das Frontend (ohne CloudFront-Policy - die kommt später)
- Dauer: ~1-2 Minuten

**Bestätigung:** Tippe `yes` wenn gefragt wird.

**Hinweis:** Das S3-Bucket wird ohne die CloudFront-Policy erstellt. Die Policy wird in Schritt 3 hinzugefügt, wenn CloudFront erstellt wird.

### Schritt 11.2: Cognito, Lambda-Funktionen und API Gateway erstellen

Jetzt erstellen wir Cognito (wird von Lambda-Funktionen benötigt), die Lambda-Funktionen und das API Gateway:

```bash
tofu apply -target=aws_cognito_user_pool.yogaswap -target=aws_cognito_user_pool_client.yogaswap_app -target=aws_cognito_user_group.admin -target=aws_cognito_user_group.instructor -target=aws_cognito_user_group.participant -target=aws_lambda_function.lambda -target=aws_iam_role.lambda_role -target=aws_iam_role_policy.lambda_policy -target=module.yogaswap_api
```

**Was passiert:**
- Erstellt Cognito User Pool (für Authentifizierung)
- Erstellt Cognito App Client
- Erstellt Cognito User Groups (admin, instructor, participant)
- Erstellt alle Lambda-Funktionen (12 Stück, inkl. create-participants)
- Erstellt API Gateway mit allen Routen
- Verknüpft Lambdas mit DynamoDB-Tabellen und Cognito
- Dauer: ~3-5 Minuten

**Bestätigung:** Tippe `yes` wenn gefragt wird.

### Schritt 11.3: CloudFront und S3-Bucket-Policy erstellen

Zuletzt erstellen wir CloudFront und aktualisieren die S3-Bucket-Policy (die den CloudFront-ARN benötigt):

```bash
tofu apply
```

**Was passiert:**
- Erstellt CloudFront Distribution
- Aktualisiert S3-Bucket-Policy (mit CloudFront-Zugriff)
- Verknüpft S3 mit CloudFront
- Lädt Frontend-Dateien ins S3-Bucket hoch
- Dauer: ~3-5 Minuten

**Bestätigung:** Tippe `yes` wenn gefragt wird.

**🎉 Fertig!** Nach diesen 3 Schritten ist alles deployed.

---

### Alternative: Alles auf einmal (für spätere Deployments)

Nach dem ersten Deployment kannst du bei späteren Updates alles auf einmal deployen:

```bash
tofu apply
```

Dies funktioniert, sobald alle Ressourcen einmal existieren.

---

## ✅ Schritt 12: URLs abrufen

Nach dem dritten Deployment-Schritt zeigt Terraform die wichtigen URLs:

```bash
tofu output
```

Du solltest sehen:
```
Outputs:

api_endpoint = "https://xxxxx.execute-api.eu-central-1.amazonaws.com"
api_url = "https://xxxxx.execute-api.eu-central-1.amazonaws.com"
cloudfront_domain = "xxxxx.cloudfront.net"
spa_bucket_regional_name = "yogaswap-xxx.s3.eu-central-1.amazonaws.com"
```

**Die CloudFront-URL ist deine Haupt-URL** für die Anwendung!

Öffne sie im Browser – deine YogaSwap-App sollte jetzt online sein! 🎉

**Hinweis:** CloudFront kann 5-15 Minuten brauchen, bis die Distribution vollständig aktiviert ist. Wenn du einen Fehler siehst, warte ein paar Minuten und lade die Seite neu.

---

## 🔧 Schritt 12.5: Frontend mit Cognito-Werten bauen und erneut deployen

**⚠️ Wichtig – häufige Fehlerquelle:** Das Frontend bäckt die Cognito-Werte (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) **zur Build-Zeit** fest ein. Der Cognito User Pool existiert aber erst **nach** dem Deployment (Schritt 11.2). Das in Schritt 7 gebaute Frontend kennt diese Werte also noch nicht – du musst es nach dem Deploy mit den echten Werten **neu bauen und erneut hochladen**.

**Welche `.env`-Datei gilt?** `npm run build` läuft im Vite-Modus `production` und lädt `app/.env.production` (höhere Priorität als `.env.local`!). `.env.local` ist nur für die lokale Entwicklung (`npm run dev`) gedacht und wird im Build überstimmt.

**1. Cognito-Werte holen:**
```bash
cd projects/yogaswap
tofu output -raw cognito_user_pool_id
tofu output -raw cognito_user_pool_client_id
```

**2. `app/.env.production` mit diesen Werten setzen:**
```bash
cd ../../app
cat > .env.production <<EOF
VITE_COGNITO_USER_POOL_ID=<cognito_user_pool_id>
VITE_COGNITO_CLIENT_ID=<cognito_user_pool_client_id>
EOF
```

**3. Frontend neu bauen und vor dem Deploy prüfen:**
```bash
npm run build
grep -rl "<cognito_user_pool_id>" build/assets   # muss die index-*.js liefern
```

**4. Erneut deployen (lädt das neue Frontend hoch):**
```bash
cd ../projects/yogaswap
tofu apply
```

Danach im Browser (am besten Inkognito) prüfen: In der Konsole muss `Amplify Config` deine korrekte `userPoolId` zeigen.

> Für eine **zweite Umgebung** (z. B. staging) nutzt du eine eigene Datei `app/.env.staging` und baust mit `npm run build:staging` – Details siehe Abschnitt „Mehrere Umgebungen" am Ende.

---

## 📊 Schritt 13: Seed-Daten laden (optional)

Falls du Beispieldaten in DynamoDB laden möchtest:

**Wichtig:** Verwende den gleichen Projektnamen wie in deiner `terraform.tfvars`!

Das Seed-Script liest automatisch den `project`-Wert aus `projects/yogaswap/terraform.tfvars`. Wenn diese Datei existiert, reicht:
```bash
cd ../../backend
npm run seed
```

Falls du den Projektnamen explizit setzen möchtest:

```bash
cd ../../backend
PROJECT_NAME="yogaswap-backend-demo-karin" npm run seed
```

**Ersetze `yogaswap-backend-demo-karin`** mit dem Projektnamen aus deiner `terraform.tfvars`.

Das Script zeigt dir, welche Tabellen verwendet werden und lädt Beispieldaten:
- Beispiel-Swaps
- Beispiel-Course-Overrides
- Beispiel-Courses

**Alternative:** Du kannst die Tabellennamen auch direkt setzen:
```bash
SWAPS_TABLE="yogaswap-backend-demo-karin-swaps-table" \
OVERRIDES_TABLE="yogaswap-backend-demo-karin-courseOverrides-table" \
COURSES_TABLE="yogaswap-backend-demo-karin-courses-table" \
npm run seed
```

---

## 👤 Schritt 14: Cognito User Groups prüfen und ggf. erstellen

**⚠️ Wichtig:** Die User Groups sollten automatisch in Schritt 11.2 erstellt worden sein. Falls sie fehlen (z.B. bei älteren Deployments), musst du sie jetzt erstellen.

**1. User Pool ID abrufen:**
```bash
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)
echo "User Pool ID: $USER_POOL_ID"
```

**2. User Groups erstellen (falls noch nicht vorhanden):**
```bash
cd ../../backend
node scripts/createGroups.js $USER_POOL_ID
```

Das Script ist idempotent - es erstellt nur fehlende Groups und ignoriert bereits existierende. Du solltest sehen:
```
✅ Group 'admin' created
✅ Group 'instructor' created
✅ Group 'participant' created
✅ All groups processed
```

Falls alle Groups bereits existieren:
```
ℹ️ Group 'admin' already exists
ℹ️ Group 'instructor' already exists
ℹ️ Group 'participant' already exists
✅ All groups processed
```

---

## 👤 Schritt 15: Ersten Admin-User erstellen

**⚠️ Wichtig:** Nach dem Deployment musst du den ersten Admin-User manuell erstellen, bevor du dich anmelden kannst.

**1. User Pool ID abrufen (falls noch nicht gemacht):**
```bash
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)
```

**2. Admin-User erstellen:**
```bash
cd ../../backend
node scripts/createAdminUser.js $USER_POOL_ID admin@example.com admin MeinPasswort123!
```

**Ersetze:**
- `admin@example.com` → Deine E-Mail-Adresse (kann mehrfach verwendet werden)
- `admin` → Dein gewünschter Nickname (**muss eindeutig sein** - wird als Username verwendet)
- `MeinPasswort123!` → Dein gewünschtes Passwort

**⚠️ Wichtig:** 
- Der **Nickname** muss eindeutig sein (wird als Username in Cognito verwendet)
- Die **E-Mail** kann mehrfach verwendet werden (z.B. mehrere User mit gleicher E-Mail)
- Beim Login wird der **Nickname** verwendet, nicht die E-Mail

**3. Default-Tenant und Admin-Mitgliedschaft anlegen (sonst „actor cannot manage participants"):**

`createAdminUser.js` legt nur den **Cognito-User** an. Damit der Admin im Portal Teilnehmer verwalten/einladen darf, braucht er zusätzlich (a) einen Tenant-Datensatz und (b) eine Mitgliedschaft mit `role: admin`. Bei normal eingeladenen Usern passiert das automatisch – nur der **erste Admin** muss von Hand gebootstrappt werden.

```bash
# (a) Default-Tenant anlegen (liest den Projektnamen aus terraform.tfvars)
cd ../../backend
npm run seed:tenants

# (b) Admin-Mitgliedschaft anlegen
#  <NICKNAME> = der Nickname/Username aus Schritt 2 (z.B. "admin")
#  <PROJECT>  = Projektname aus terraform.tfvars (z.B. yogaswap-demo)
aws dynamodb put-item \
  --table-name <PROJECT>-memberships-table \
  --item '{"tenantId":{"S":"default-tenant"},"userId":{"S":"<NICKNAME>"},"role":{"S":"admin"}}' \
  --region eu-central-1
```

> Hinweis: Dieser manuelle Bootstrap soll künftig ein eigenes `create-tenant`-Script übernehmen (Issue #53).

**4. Login testen:**
1. Öffne die CloudFront-URL im Browser (aus `tofu output cloudfront_domain`)
2. Logge dich mit dem Nickname und Passwort ein
3. Du solltest als Admin eingeloggt sein und Teilnehmer verwalten können

**Nach dem Login:**
- Über das AdminPanel kannst du weitere User einladen
- Die Einladungs-E-Mails werden über SES versendet (siehe Hinweis unten)

---

## 📧 Schritt 16: SES E-Mail-Adresse konfigurieren (optional, aber empfohlen)

**Damit Einladungs-E-Mails versendet werden können, musst du eine E-Mail-Adresse in AWS SES verifizieren.**

**1. E-Mail-Adresse in AWS SES verifizieren:**
1. Gehe zu AWS Console → SES → Verified identities
2. Klicke auf "Create identity" → "Email address"
3. Gib deine E-Mail-Adresse ein (z.B. `yogaswap@example.com`)
4. Bestätige die Verifizierungs-E-Mail, die an diese Adresse gesendet wird

**2. E-Mail-Adresse in `terraform.tfvars` setzen:**
```bash
cd projects/yogaswap
# Öffne terraform.tfvars und setze:
# ses_source_email = "deine-verifizierte-email@example.com"
```

**3. Lambda neu deployen (wichtig!):**
Nach Änderung von `ses_source_email` muss die Lambda-Funktion neu deployed werden, damit die Environment Variable aktualisiert wird:

```bash
cd projects/yogaswap
tofu apply
```

**Das ist wichtig!** Ohne `tofu apply` wird die neue E-Mail-Adresse nicht in der Lambda verwendet.

**Nach dem Deployment:**
- Einladungs-E-Mails können nun versendet werden
- Falls die E-Mail nicht versendet werden kann, zeigt das AdminPanel das temporäre Passwort an

**Hinweise:**
- In AWS SES Sandbox-Modus können E-Mails nur an verifizierte E-Mail-Adressen gesendet werden
- Für Produktion: Verlasse den Sandbox-Modus oder verifiziere deine Domain in SES
- Siehe auch `README.md` für weitere Optionen (Domain-Verifizierung, etc.)

---

## 🔧 Problem: Passwort muss beim ersten Login geändert werden

**Falls dein Admin-User bereits erstellt wurde und das Passwort als temporär gesetzt ist:**

Du kannst das Passwort für einen existierenden User permanent setzen (damit keine Passwortänderung erforderlich ist):

**Mit AWS CLI:**
```bash
# User Pool ID abrufen
cd projects/yogaswap
USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)

# Passwort permanent setzen (ersetzt das temporäre Passwort)
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

---

## 🔄 Alternative: Alles auf einmal mit Deployment-Script (erst nach 1. Deployment!)

**⚠️ Hinweis:** Das Deployment-Script ist für **spätere Updates** gedacht. Beim ersten Mal solltest du die 3 Schritte manuell durchführen (siehe Schritt 11).

**Für spätere Deployments** kannst du das Script verwenden:

```bash
cd /Users/karin/repos/yogaswap
./scripts/deploy.sh yogaswap-backend-demo-karin
```

Das Script:
- Baut alle Komponenten
- Erstellt/aktualisiert `terraform.tfvars`
- Führt `tofu init` aus (falls nötig)
- Zeigt den Plan
- Fragt nach Bestätigung
- Führt `tofu apply` aus

**Nach dem ersten Deployment** funktioniert `tofu apply` ohne `-target` Flags, da alle Ressourcen bereits existieren.

---

## 🌍 Mehrere Umgebungen (staging/prod) mit OpenTofu-Workspaces

Du kannst dieselbe Terraform-Konfiguration für mehrere getrennte Umgebungen nutzen. Das Prinzip:

- **Umgebung = eigener OpenTofu-Workspace** (eigener State). Die env-spezifischen Werte (`project`, Emails, CloudFront-Aliases, cert-ARN) werden in `env.tf` **automatisch aus dem aktiven Workspace abgeleitet** – kein `-var-file` mehr nötig (#241).
- **Tenant (Studio) = logisch innerhalb einer Umgebung** über `tenantId`/Subdomain.

`default`-Workspace = prod (`project = "yogaswap-demo"`, bedient `app.yogaswap.de`). Eine zweite Umgebung (z. B. staging) wird rein additiv daneben aufgebaut, ohne prod anzufassen.

**Wo liegen die Werte?**

- Nicht-sensible Werte (`project`, `cloudfront_aliases`) stehen pro Workspace committed in `projects/yogaswap/env.tf` (`locals.env_public`).
- Sensible Werte (Emails = PII, cert-ARN mit AWS-Account-ID) liegen pro Workspace in der **gitignored** Datei `projects/yogaswap/env.<workspace>.json` (Vorlage: `env.<workspace>.json.example`). Das Repo ist öffentlich – diese Werte gehören nicht eingecheckt.

> **Schutz vor Env-Vermischung:** tofu liest die Werte nur noch aus dem Workspace. Ein vergessenes `-var-file` kann daher **nicht** mehr prod-Werte in den staging-State ziehen. Unbekannter Workspace → `env.tf` wirft einen klaren Fehler statt eines prod-Fallbacks.

### staging anlegen

```bash
cd projects/yogaswap

# 1. Eigenen State über einen Workspace (einmalig)
tofu workspace new staging
tofu workspace show                          # MUSS "staging" zeigen

# 2. Sensible Werte für staging hinterlegen (gitignored)
cp env.staging.json.example env.staging.json # ses_source_email etc. anpassen

# 3. Deployen – ohne -var-file (Werte kommen aus dem Workspace)
tofu apply                                   # oder: make apply ENV=staging
```

Beim allerersten Apply einer frischen Umgebung kann die S3/CloudFront-Abhängigkeit den 3-Schritt-Apply aus Schritt 11 erfordern.

**Komfort:** Das `Makefile` in `projects/yogaswap/` kapselt Workspace-Wahl + Befehl:

```bash
make plan  ENV=staging
make apply ENV=staging
make plan  ENV=default    # default = prod
```

### Frontend für staging bauen

```bash
# eigene Datei mit den staging-Cognito-Werten (aus: tofu output im staging-Workspace)
cat > app/.env.staging <<EOF
VITE_COGNITO_USER_POOL_ID=<staging_pool_id>
VITE_COGNITO_CLIENT_ID=<staging_client_id>
EOF

cd app && npm run build:staging             # lädt .env.staging statt .env.production
cd ../projects/yogaswap && tofu apply       # Workspace staging
```

`.env.production` (prod) und `.env.staging` (staging) bleiben so getrennt – kein Datei-Hin-und-Her. Beide sind in `.gitignore` und bleiben lokal.

### Admin-Bootstrap je Umgebung

Den Tenant + die Admin-Mitgliedschaft (Schritt 15.3) musst du pro Umgebung anlegen – mit den **Tabellennamen der jeweiligen Umgebung**, z. B. für staging:

```bash
cd backend
TENANTS_TABLE=yogaswap-staging-tenants-table npm run seed:tenants
aws dynamodb put-item \
  --table-name yogaswap-staging-memberships-table \
  --item '{"tenantId":{"S":"default-tenant"},"userId":{"S":"<NICKNAME>"},"role":{"S":"admin"}}' \
  --region eu-central-1
```

---

## 🐛 Häufige Probleme

### Problem: "Access Denied" beim tofu apply

**Lösung:** Dein AWS-User hat nicht genug Berechtigungen.
- Prüfe in AWS IAM → Users → dein User → Permissions
- Stelle sicher, dass AdministratorAccess oder die benötigten Policies angehängt sind

### Problem: "Bucket name already exists"

**Lösung:** Der Bucket-Name ist nicht eindeutig.
- Ändere den `project`-Namen in `terraform.tfvars`
- Wähle einen einzigartigeren Namen

### Problem: "region mismatch"

**Lösung:** Prüfe, dass die Region in `terraform.tfvars` mit deiner AWS-CLI-Region übereinstimmt.

### Problem: "tofu: command not found"

**Lösung:** OpenTofu ist nicht installiert oder nicht im PATH.
```bash
brew install opentofu
source ~/.zshrc
```

### Problem: "Resource dependency error" oder zirkuläre Abhängigkeit

**Lösung:** Beim ersten Deployment musst du die 3 Schritte befolgen (siehe Schritt 11). Nach dem ersten Deployment kannst du `tofu apply` ohne `-target` Flags verwenden.

---

## 📝 Checkliste für neuen Rechner

- [ ] Homebrew installiert
- [ ] Node.js 22 installiert (`node --version`, siehe `.nvmrc`)
- [ ] OpenTofu installiert (`tofu --version`)
- [ ] AWS CLI installiert (`aws --version`)
- [ ] AWS Access Keys erstellt
- [ ] AWS CLI konfiguriert (`aws configure`)
- [ ] AWS-Credentials getestet (`aws sts get-caller-identity`)
- [ ] Projekt-Abhängigkeiten installiert (`./scripts/setup.sh`)
- [ ] Setup-Check erfolgreich (`./scripts/check-setup.sh`)
- [ ] `terraform.tfvars` erstellt und konfiguriert
- [ ] Terraform initialisiert (`tofu init`)
- [ ] Schritt 1: DynamoDB-Tabellen und S3-Bucket erstellt
- [ ] Schritt 2: Cognito, Lambdas und API Gateway erstellt
- [ ] Schritt 3: CloudFront und S3-Bucket-Policy erstellt
- [ ] URLs abgerufen (`tofu output`)
- [ ] Frontend mit Cognito-Werten (`.env.production`) neu gebaut und erneut deployed (Schritt 12.5)
- [ ] Cognito-Environment-Variablen für lokale Entwicklung konfiguriert (`.env.local`)
- [ ] Cognito User Groups geprüft/erstellt (`node scripts/createGroups.js ...`)
- [ ] Ersten Admin-User erstellt (`node scripts/createAdminUser.js ...`)
- [ ] Default-Tenant geseedet (`npm run seed:tenants`)
- [ ] Admin-Mitgliedschaft angelegt (`aws dynamodb put-item ... memberships-table`)
- [ ] (Optional) Seed-Daten geladen (`npm run seed`)
- [ ] (Optional) SES E-Mail-Adresse verifiziert und in `terraform.tfvars` gesetzt
- [ ] (Optional) Lambda nach SES-Konfiguration neu deployed (`tofu apply`)

---

## 🎓 Zusammenfassung der wichtigsten Befehle

```bash
# Setup prüfen
./scripts/check-setup.sh

# Alles installieren und bauen
./scripts/setup.sh

# Deployment (automatisch)
./scripts/deploy.sh <projektname>

# Erste Deployment (in 3 Schritten)
cd projects/yogaswap
tofu init
tofu apply -target=module.swaps_table -target=module.course_overrides_table -target=module.courses_table -target=module.spa_site
tofu apply -target=aws_cognito_user_pool.yogaswap -target=aws_cognito_user_pool_client.yogaswap_app -target=aws_cognito_user_group.admin -target=aws_cognito_user_group.instructor -target=aws_cognito_user_group.participant -target=aws_lambda_function.lambda -target=aws_iam_role.lambda_role -target=aws_iam_role_policy.lambda_policy -target=module.yogaswap_api
tofu apply

# Spätere Deployments (alles auf einmal)
tofu apply

# Infrastruktur löschen (wenn nötig)
tofu destroy
```

---

Viel Erfolg! 🚀

