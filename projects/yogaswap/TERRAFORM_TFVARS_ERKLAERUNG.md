# terraform.tfvars - Erklärung

## Was ist terraform.tfvars?

`terraform.tfvars` ist eine Konfigurationsdatei für Terraform/OpenTofu, die dir erlaubt, **Werte für Variablen** festzulegen, ohne den Code selbst ändern zu müssen.

## Warum wird es verwendet?

### Das Problem ohne terraform.tfvars:

In deinem Code sind Variablen definiert (`variables.tf`):

```hcl
variable "project" {
  description = "Projektname für Ressourcen-Namen"
  type        = string
  default     = "yogaswap-backend-demo"  # <- Default-Wert
}
```

Diese Variablen werden im Code verwendet:
- `${var.project}-site` → wird zum S3-Bucket-Namen
- `${var.project}-swaps-table` → wird zum DynamoDB-Tabellennamen
- `${var.project}-api` → wird zum API Gateway-Namen

**Problem:** Wenn du die Anwendung auf mehreren AWS-Accounts oder mit unterschiedlichen Namen betreiben willst, musst du den Code ändern oder bei jedem `tofu apply` Werte eingeben.

### Die Lösung mit terraform.tfvars:

Mit `terraform.tfvars` kannst du **projekt-spezifische Werte** setzen, ohne den Code zu ändern:

```hcl
# terraform.tfvars
project = "yogaswap-backend-demo-karin"
region  = "eu-central-1"
```

## Wie funktioniert es?

### 1. Variablen definieren (`variables.tf`)

Hier werden die Variablen **definiert** (wie ein Formular-Feld):

```hcl
variable "project" {
  description = "Projektname für Ressourcen-Namen"
  type        = string
  default     = "yogaswap-backend-demo"  # Fallback, wenn nichts gesetzt
}

variable "region" {
  description = "AWS-Region"
  type        = string
  default     = "eu-central-1"
}
```

### 2. Variablen verwenden (im Code)

Die Variablen werden im Code verwendet:

```hcl
# s3.tf
bucket_name = "${var.project}-site"  # <- Verwendet var.project

# dynamodb.tf
name = "${var.project}-swaps-table"  # <- Verwendet var.project

# main.tf
provider "aws" {
  region = var.region  # <- Verwendet var.region
}
```

### 3. Werte setzen (`terraform.tfvars`)

Hier setzt du die **tatsächlichen Werte**:

```hcl
# terraform.tfvars
project = "yogaswap-backend-demo-karin"  # <- Dein eigener Wert
region  = "eu-central-1"
```

### Beispiel-Flow:

1. Du setzt in `terraform.tfvars`: `project = "yogaswap-backend-demo-karin"`
2. Terraform liest diesen Wert
3. Im Code wird `${var.project}-site` zu `yogaswap-backend-demo-karin-site`
4. Der S3-Bucket wird mit diesem Namen erstellt

## Was muss ich ändern?

### ✅ NICHTS am bestehenden Code!

Der Code funktioniert bereits perfekt mit Variablen. Du musst nur:

1. **Datei erstellen:** `projects/yogaswap/terraform.tfvars`

2. **Deine Werte eintragen:**
   ```hcl
   project = "yogaswap-backend-demo-karin"  # Ändere zu deinem Namen!
   region  = "eu-central-1"                  # Kannst du anpassen
   ```

3. **Fertig!** Terraform/OpenTofu liest diese Datei automatisch.

### Optionale Alternative: Terraform fragt dich

Wenn du **keine** `terraform.tfvars` erstellst, verwendet Terraform die **Default-Werte** aus `variables.tf`:
- `project = "yogaswap-backend-demo"` (Default)
- `region = "eu-central-1"` (Default)

Oder du kannst Werte bei jedem Befehl übergeben:
```bash
tofu apply -var="project=yogaswap-backend-demo-karin"
```

## Was gehört in terraform.tfvars?

✅ **JA, gehört rein:**
- Projekt-spezifische Werte (verschiedene Entwickler/Accounts)
- Lokale Konfiguration (z.B. deine bevorzugte Region)
- Werte, die sich zwischen Environments unterscheiden

❌ **NEIN, gehört NICHT rein:**
- Sensible Daten (Passwörter, API-Keys) → Nutze AWS Secrets Manager
- Code-Logik
- Unveränderliche Default-Werte

## Gehört terraform.tfvars in .gitignore?

### ✅ JA, definitiv!

**Warum?**

1. **Personen-spezifische Werte:** Jeder Entwickler hat seinen eigenen Projektnamen
2. **Account-spezifisch:** Verschiedene AWS-Accounts brauchen verschiedene Namen
3. **Vermeidet Konflikte:** Wenn zwei Personen verschiedene Werte committen, gibt es Merge-Konflikte

### Was gehört ins Git?

✅ **terraform.tfvars.example** → Beispiel-Datei (DOKUMENTATION)
❌ **terraform.tfvars** → Echte Werte (PERSONAL)

### Workflow:

1. **terraform.tfvars.example** ist im Git (zeigt, welche Werte gesetzt werden können)
2. Jeder Entwickler kopiert die `.example` zu `.tfvars` und passt seine Werte an
3. `terraform.tfvars` ist in `.gitignore` (wird nicht committet)

## Zusammenfassung

| Frage | Antwort |
|-------|---------|
| **Was ist terraform.tfvars?** | Datei zum Setzen von Variablen-Werten |
| **Wofür brauche ich es?** | Projekt-spezifische Konfiguration ohne Code-Änderungen |
| **Was muss ich ändern?** | Nichts! Nur Datei erstellen mit deinen Werten |
| **In .gitignore?** | ✅ JA, definitiv! |
| **Was committen?** | `terraform.tfvars.example` (nur als Beispiel) |

## Beispiel

```bash
# 1. Beispiel-Datei kopieren
cd projects/yogaswap
cp terraform.tfvars.example terraform.tfvars

# 2. Deine Werte eintragen
# Öffne terraform.tfvars und ändere:
# project = "yogaswap-backend-demo-karin"

# 3. Verwenden
tofu plan   # Terraform liest automatisch terraform.tfvars
tofu apply  # Deine Werte werden verwendet
```

**Fertig!** 🎉

