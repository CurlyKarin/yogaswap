# 🚀 Deployment-Schritte - Erste Installation

Beim ersten Deployment musst du in 3 Schritten vorgehen, um zirkuläre Abhängigkeiten zu vermeiden.

## Voraussetzungen

- Terraform/OpenTofu initialisiert: `tofu init`
- `terraform.tfvars` erstellt und konfiguriert
- Frontend gebaut: `cd ../../app && npm run build`
- Lambda-ZIPs erstellt: `cd ../../backend && npm run build-lambdas && npm run zip`

---

## Schritt 1: DynamoDB-Tabellen und S3-Bucket erstellen

**Warum zuerst?** Die Lambda-Funktionen benötigen die DynamoDB-Tabellen für ihre Environment-Variablen. Das S3-Bucket muss ebenfalls zuerst erstellt werden, bevor CloudFront darauf zugreifen kann.

```bash
cd projects/yogaswap
tofu apply -target=module.swaps_table -target=module.course_overrides_table -target=module.courses_table -target=module.spa_site
```

**Was wird erstellt:**
- ✅ DynamoDB-Tabelle: `{project}-swaps-table`
- ✅ DynamoDB-Tabelle: `{project}-courseOverrides-table`
- ✅ DynamoDB-Tabelle: `{project}-courses-table`
- ✅ S3-Bucket: `{project}-site` (ohne CloudFront-Policy - die kommt später)

**Dauer:** ~1-2 Minuten

**Hinweis:** Das S3-Bucket wird ohne die CloudFront-Policy erstellt. Die Policy wird in Schritt 3 hinzugefügt, wenn CloudFront erstellt wird.

---

## Schritt 2: Lambda-Funktionen und API Gateway erstellen

**Warum jetzt?** Die Lambdas brauchen die Tabellen aus Schritt 1. API Gateway braucht die Lambdas.

```bash
tofu apply -target=aws_lambda_function.lambda -target=aws_iam_role.lambda_role -target=aws_iam_role_policy.lambda_policy -target=module.yogaswap_api
```

**Was wird erstellt:**
- ✅ 11 Lambda-Funktionen (get-swaps, create-swap, update-swap, etc.)
- ✅ IAM-Rollen und -Policies für die Lambdas
- ✅ API Gateway mit allen Routen

**Dauer:** ~3-5 Minuten

---

## Schritt 3: CloudFront und S3-Bucket-Policy erstellen

**Warum zuletzt?** Die S3-Bucket-Policy benötigt den CloudFront-ARN. Jetzt erstellen wir CloudFront und aktualisieren die S3-Bucket-Policy entsprechend.

```bash
tofu apply
```

**Was wird erstellt:**
- ✅ CloudFront Distribution
- ✅ S3-Bucket-Policy (mit CloudFront-Zugriff)
- ✅ Frontend-Dateien werden ins S3-Bucket hochgeladen

**Dauer:** ~3-5 Minuten

**Nach diesem Schritt:** Alle Ressourcen sind erstellt! ✅

---

## URLs abrufen

Nach Schritt 3 kannst du die URLs abrufen:

```bash
tofu output
```

**Wichtige URLs:**
- `cloudfront_domain` → Deine Haupt-URL für die Anwendung
- `api_endpoint` → API Gateway URL

---

## ⚠️ Hinweise

### Erste Installation vs. Updates

- **Erste Installation:** Verwende die 3 Schritte oben
- **Spätere Updates:** Du kannst einfach `tofu apply` ausführen (ohne `-target` Flags)

### CloudFront-Aktivierung

Die CloudFront Distribution kann **5-15 Minuten** brauchen, bis sie vollständig aktiviert ist. Wenn du einen Fehler siehst, warte ein paar Minuten und lade die Seite neu.

### Fehlerbehebung

Falls ein Schritt fehlschlägt:
1. Prüfe die Fehlermeldung genau
2. Häufig: Prüfe AWS-Credentials (`aws sts get-caller-identity`)
3. Häufig: Prüfe IAM-Berechtigungen

---

## 🧹 Infrastruktur löschen

Um alles wieder zu löschen:

```bash
tofu destroy
```

**Achtung:** Dies löscht ALLE Ressourcen inklusive der Daten in DynamoDB!

