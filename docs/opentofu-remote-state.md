# OpenTofu Remote-State (#274)

Ziel: lokaler State (`terraform.tfstate` / `terraform.tfstate.d/`) nach S3,
damit GitHub Actions und dein Laptop denselben Stand sehen.

## Bootstrap (einmalig, schon erledigt)

```bash
./scripts/bootstrap-opentofu-backend.sh
```

Angelegt:

| Ressource | Name |
|---|---|
| S3-Bucket | `yogaswap-opentofu-state` |
| DynamoDB-Lock | `yogaswap-opentofu-locks` |
| Region | `eu-central-1` |

## Backend in Code

`projects/yogaswap/main.tf` → `backend "s3"` mit obigem Bucket/Key/Lock.

Workspace-Pfade in S3 (OpenTofu-Standard):

- `default`: `yogaswap/terraform.tfstate`
- `staging`: `env:/staging/yogaswap/terraform.tfstate`
- `prod`: `env:/prod/yogaswap/terraform.tfstate`

## Migration (einmalig, lokal)

**Status:** Migration am 2026-07-29 durchgeführt. Backup unter
`projects/yogaswap/.state-backup-274-*` (gitignored).

**Vorher:** lokale State-Dateien sichern (Kopie von `terraform.tfstate` und `terraform.tfstate.d/`).

Pro Workspace (OpenTofu hat bei uns alle Workspaces in einem `init -migrate-state` mitgezogen):

```bash
cd projects/yogaswap
tofu init -migrate-state -force-copy
```

Falls ein Workspace fehlt:

```bash
tofu workspace new staging
tofu state push .state-backup-…/terraform.tfstate.d/staging/terraform.tfstate
```

Prüfen:

```bash
tofu workspace select staging
tofu plan   # Frontend-Hash-Diffs sind normal, wenn lokal ein anderes app/build liegt
```

## CI

Nach erfolgreicher Migration sollte `Deploy Staging` den Workspace `staging` in S3 finden.
OIDC-Rolle braucht DynamoDB-Lock-Rechte (`github-actions.tf`, Sid `OpenTofuStateLock`).

## Rollback

Backend wieder auf `backend "local" {}`, `tofu init -migrate-state` (zieht State zurück).
Nur nötig, wenn etwas schiefgeht — Bucket behalten.
