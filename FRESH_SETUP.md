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
project = "<PROJECT_NAME>"  # Ändere zu deinem Namen!
region  = "eu-central-1"
```

**Beispiele für eindeutige Namen:**
- `yogaswap-<studio>`
- `yogaswap-<studio>-prod`
- `yogaswap-<studio>-2025`

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

**Welche `.env`-Datei gilt?** Pro Umgebung eine eigene Datei; `make deploy` wählt den passenden Vite-Modus automatisch (`demo` / `staging` / `prod`). `.env.local` ist nur für `npm run dev` gedacht.

**1. Cognito-Werte holen:**
```bash
cd projects/yogaswap
tofu output -raw cognito_user_pool_id
tofu output -raw cognito_user_pool_client_id
```

**2. `app/.env.demo` mit diesen Werten setzen** (Demo-Stack / Workspace `default`):
```bash
cd ../../app
cat > .env.demo <<EOF
VITE_COGNITO_USER_POOL_ID=<cognito_user_pool_id>
VITE_COGNITO_CLIENT_ID=<cognito_user_pool_client_id>
VITE_DEFAULT_TENANT_ID=default-tenant
EOF
```

`VITE_DEFAULT_TENANT_ID` legt fest, welcher Tenant im Frontend standardmäßig als `x-tenant-id` gesetzt wird (z. B. `beharmony`).

**3. Frontend neu bauen und vor dem Deploy prüfen:**
```bash
npm run build:demo
grep -rl "<cognito_user_pool_id>" build/assets   # muss die index-*.js liefern
```

**4. Erneut deployen (lädt das neue Frontend hoch):**
```bash
cd ../projects/yogaswap
tofu apply
```

Danach im Browser (am besten Inkognito) prüfen: In der Konsole muss `Amplify Config` deine korrekte `userPoolId` zeigen.

> Für **staging** und **prod** nutzt du `app/.env.staging` bzw. `app/.env.prod` und baust mit `npm run build:staging` / `npm run build:prod` – Details siehe Abschnitt „Mehrere Umgebungen" am Ende.

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
PROJECT_NAME="<PROJECT_NAME>" npm run seed
```

**Setze `<PROJECT_NAME>`** auf den Projektnamen aus deiner `terraform.tfvars`.

Das Script zeigt dir, welche Tabellen verwendet werden und lädt Beispieldaten:
- Beispiel-Swaps
- Beispiel-Course-Overrides
- Beispiel-Courses

**Alternative:** Du kannst die Tabellennamen auch direkt setzen:
```bash
SWAPS_TABLE="<PROJECT_NAME>-swaps-table" \
OVERRIDES_TABLE="<PROJECT_NAME>-courseOverrides-table" \
COURSES_TABLE="<PROJECT_NAME>-courses-table" \
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

Beides erledigt das `create-tenant`-Script idempotent (legt den Tenant nur an, falls er fehlt, und setzt die Membership):

```bash
#  <NICKNAME> = der Nickname/Username aus Schritt 2 (z.B. "admin")
#  <PROJECT>  = Projektname der Umgebung (z.B. yogaswap-demo, yogaswap-staging)
cd ../../backend
PROJECT_NAME="<PROJECT>" npm run create-tenant -- \
  --tenant default-tenant --admin-nickname <NICKNAME>
```

> Tipp: Für eine frische Umgebung erledigt **Schritte 14 + 15 in einem Rutsch** der Wrapper
> `make bootstrap-admin ENV=<env> EMAIL=<mail> NICKNAME=<nick>` (Gruppen + Admin-User + Tenant + Membership).
> Einen **weiteren** Tenant für denselben Admin legst du mit `make create-tenant ENV=<env> TENANT=<id> ADMIN=<nick>` an.

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

## 🔄 Alternative: Deployment-Script / Makefile (erst nach 1. Deployment!)

**⚠️ Hinweis:** Für den allerersten Aufbau einer Umgebung folge der manuellen 3-Schritt-Anleitung (Schritt 11). Für **spätere Deployments** ist das der normale Weg:

```bash
cd /Users/karin/repos/yogaswap
make -C projects/yogaswap deploy ENV=staging   # oder ENV=default (Demo)
# gleichwertig:
./scripts/deploy.sh staging
```

Das Script (workspace-aware, #245):
- wählt + verifiziert den OpenTofu-Workspace (= Umgebung)
- leitet den Projektnamen aus `env.tf` ab (Single Source) – kein `terraform.tfvars`-Schreiben mehr
- baut alle Komponenten und **koppelt den Frontend-Build-Modus an die Umgebung**
  (`default` → `vite --mode demo` + `app/.env.demo`, sonst → `vite --mode <env>`), damit nie die
  falschen Cognito-Werte eingebacken werden
- führt `tofu init` aus (falls nötig), zeigt den Plan, fragt nach Bestätigung, `tofu apply`

**Nach dem ersten Deployment** funktioniert `tofu apply` ohne `-target` Flags, da alle Ressourcen bereits existieren.

---

## 🌍 Mehrere Umgebungen (staging/prod) mit OpenTofu-Workspaces

Du kannst dieselbe Terraform-Konfiguration für mehrere getrennte Umgebungen nutzen. Das Prinzip:

- **Umgebung = eigener OpenTofu-Workspace** (eigener State). Die env-spezifischen Werte (`project`, Emails, CloudFront-Aliases, cert-ARN) werden in `env.tf` **automatisch aus dem aktiven Workspace abgeleitet** – kein `-var-file` mehr nötig (#241).
- **Tenant (Studio) = logisch innerhalb einer Umgebung** über `tenantId`/Subdomain.

`default`-Workspace = **Demo** (`project = "yogaswap-demo"`, `demo.yogaswap.de`). **prod** ist Workspace `prod` (`yogaswap-prod`, `app.yogaswap.de`). Staging und prod werden additiv daneben aufgebaut.

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

# 3. Infrastruktur anlegen (nur Infra, ohne Frontend) – liefert die Cognito-IDs
tofu apply                                   # oder: make apply ENV=staging
```

Beim allerersten Apply einer frischen Umgebung kann die S3/CloudFront-Abhängigkeit den 3-Schritt-Apply aus Schritt 11 erfordern.

### Frontend-Cognito-Werte für staging hinterlegen (einmalig)

```bash
# Werte aus den tofu outputs des staging-Workspace
cat > app/.env.staging <<EOF
VITE_COGNITO_USER_POOL_ID=<staging_pool_id>
VITE_COGNITO_CLIENT_ID=<staging_client_id>
VITE_DEFAULT_TENANT_ID=default-tenant
EOF
```

`.env.demo` (demo/default), `.env.staging` und `.env.prod` bleiben getrennt – `make deploy` wählt automatisch den richtigen Modus. Alle drei Dateien sind gitignored.

> Migration (#253): Falls noch `app/.env.production` existiert → `mv .env.production .env.demo`

### Admin-Bootstrap je Umgebung

Den ersten Admin (Tenant + Cognito-Gruppen + Admin-User + Membership) legst du pro Umgebung mit **einem** Befehl an – Projektname, Cognito-Pool und Region werden aus dem Workspace abgeleitet:

```bash
make -C projects/yogaswap bootstrap-admin ENV=staging \
  EMAIL=admin@example.com NICKNAME=admin
# optional: PASSWORD=… (sonst wird ein temporäres Passwort erzeugt)
```

Nur den Tenant (ohne Admin) anlegen: `make seed-tenants ENV=staging`.

### Danach: bauen + deployen

```bash
make deploy ENV=staging     # baut staging-Frontend + lädt hoch
```

**Alle Make-Targets:**

```bash
make deploy ENV=staging     # bauen + deployen (normaler Weg)
make deploy ENV=prod        # prod (yogaswap-prod)
make deploy ENV=default     # demo (yogaswap-demo)
make plan   ENV=staging     # nur Infra-Plan (kein Frontend-Build)
make apply  ENV=staging     # nur Infra-Apply (kein Frontend-Build)
make test                   # lokale Checks (Backend-Tests + FE-Typecheck)
```

### prod anlegen (#248)

Frischer prod-Stack mit Präfix `yogaswap-prod` und Domain `app.yogaswap.de`. **Keine Datenmigration** vom Demo-Stack – der `default`-Workspace (Demo) bleibt parallel auf `demo.yogaswap.de`.

```bash
cd projects/yogaswap

# 1. Eigenen State (einmalig)
tofu workspace new prod
tofu workspace show                          # MUSS "prod" zeigen

# 2. Sensible Werte (gitignored)
cp env.prod.json.example env.prod.json       # ses_source_email etc.; cert-ARN LEER lassen (Bootstrap)

# 3. Infrastruktur – gestaffelt wie Schritt 11 (frische Umgebung)
tofu workspace select prod
tofu apply -target=module.swaps_table -target=module.course_overrides_table -target=module.courses_table -target=module.tenants_table -target=module.memberships_table -target=module.participants_table -target=module.auth_tokens_table -target=module.spa_site

tofu apply -target=aws_cognito_user_pool.yogaswap -target=aws_cognito_user_pool_client.yogaswap_app -target=aws_cognito_user_group.admin -target=aws_cognito_user_group.instructor -target=aws_cognito_user_group.participant -target=aws_lambda_function.lambda -target=aws_iam_role.lambda_role -target=aws_iam_role_policy.lambda_policy -target=module.yogaswap_api
```

**4. Frontend-Cognito-Werte für prod:**

```bash
tofu workspace select prod
cat > ../../app/.env.prod <<EOF
VITE_COGNITO_USER_POOL_ID=$(tofu output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(tofu output -raw cognito_user_pool_client_id)
VITE_DEFAULT_TENANT_ID=default-tenant
EOF
```

**5. Admin-Bootstrap + Test-Tenant (#53):**

```bash
make -C projects/yogaswap bootstrap-admin ENV=prod EMAIL=admin@example.com NICKNAME=admin
# optional: weiteren Tenant testen
make -C projects/yogaswap create-tenant ENV=prod TENANT=yogastudio-test ADMIN=admin
```

**6. DNS für Demo (`demo.yogaswap.de`):**

**Schritt A – ACM-Zertifikat validieren** (einmalig, Region `us-east-1`):

1. In der AWS-Konsole: ACM → Zertifikat für `demo.yogaswap.de` → DNS-Validierung
2. **IONOS:** CNAME eintragen (Beispiel – Werte aus der Konsole übernehmen):
   - Name: `_1c374e5671348085f7fc5cf3a9e3fb75.demo`
   - Ziel: `_2adfb99e527e814d93ade695834aacec.jkddzztszm.acm-validations.aws`
3. Warten bis Status **Issued** (`aws acm describe-certificate --certificate-arn <arn> --region us-east-1`)

**Schritt B – CloudFront-Alias** (nach `tofu apply` auf Workspace `default`):

1. `tofu output cloudfront_domain` → z. B. `d1cvi2br361w6h.cloudfront.net`
2. **IONOS:** CNAME `demo` → diese CloudFront-Domain (TTL kurz halten zum Testen)
3. Prüfen: `dig demo.yogaswap.de CNAME @8.8.8.8`

`env.default.json`: `cloudfront_acm_certificate_arn` muss das **demo**-Zertifikat sein (nicht das von `app.yogaswap.de`).

**DNS-Cutover prod (`app.yogaswap.de`):** Bereits erledigt (#248). Jede Subdomain darf nur an **eine** CloudFront-Distribution hängen.

**8. SES:** Für echte Teilnehmer-Mails Production-Access in der AWS-Konsole beantragen (Sandbox reicht zum Testen).

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
- [ ] Frontend mit Cognito-Werten (`.env.demo` o. ä.) neu gebaut und erneut deployed (Schritt 12.5)
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

# Deployment (automatisch, workspace-aware)
make -C projects/yogaswap deploy ENV=staging   # oder ENV=default (Demo)

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

