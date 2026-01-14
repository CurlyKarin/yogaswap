# Setup

- ### Dependencies installieren:

````bash
cd backend
npm install
````

- ### Lokale Typen-Verknüpfung sicherstellen:
Das @yogaswap/shared-Package wird über file:../shared eingebunden.
Änderungen in shared/ erfordern einen erneuten Build dort:

````bash
cd ../shared
npm run build
````

# Arbeiten mit dem Backend

## 1. Build

Baut das Backend mit TypeScript nach dist/:
````bash
npm run build
````

## 2. Entwicklung (lokal) (kann weg, denke ich)
Starte eine Dev-Umgebung (z. B. für Tests oder Seeds):

````bash
npm run dev
````

## 3. Seeds
Befülle DynamoDB mit Beispieldaten:

**Wichtig:** Die Tabellennamen müssen deinem Terraform-Projektnamen entsprechen!

**Option 1: Automatisch (empfohlen)**  
Wenn `projects/yogaswap/terraform.tfvars` vorhanden ist, wird der `project`-Wert automatisch übernommen.  
Einfach ausführen:
```bash
npm run seed
```

**Option 2: Mit PROJECT_NAME**
```bash
PROJECT_NAME="yogaswap-backend-demo-karin" npm run seed
```

**Option 3: Tabellennamen direkt setzen**
```bash
SWAPS_TABLE="yogaswap-backend-demo-karin-swaps-table" \
OVERRIDES_TABLE="yogaswap-backend-demo-karin-courseOverrides-table" \
COURSES_TABLE="yogaswap-backend-demo-karin-courses-table" \
npm run seed
```

**Hinweis:** Stelle sicher, dass die Tabellen bereits in AWS existieren (nach Schritt 1 des Deployments)!

## 4. Deployment Zips
Erstellt Zip-Dateien für die Lambdas im Verzeichnis dist/zips/:

````bash
npm run zip
````

# Workflow bei Änderungen

- ## Änderungen an den Typen (shared/)
- cd shared
- npm run build
- zurück ins Backend → npm run build

- ## Änderungen am Backend-Code (backend/src/)
- cd backend
- npm run build

- ## Neue Seeds hinzufügen
- Datei in src/seed/ erstellen
- eigenes Script in package.json ergänzen
- über npm run seed:XYZ ausführen

- ## Deployment vorbereiten
- npm run build
- npm run zip
- Terraform/Tofu anwenden (tofu apply)