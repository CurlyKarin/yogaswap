# GitHub Actions Deploys (#15 / #279)

| Workflow | Wann | OpenTofu-Workspace | Frontend-Modus |
|---|---|---|---|
| **Deploy Staging** | automatisch nach Merge auf `main` + manuell | `staging` | `staging` |
| **Deploy Demo** | nur manuell (`workflow_dispatch`) | `default` | `demo` |
| **Deploy Prod** | nur manuell | `prod` | `prod` |

Manuell: Repo → **Actions** → Workflow wählen → **Run workflow** (Branch `main`).

## Secrets (GitHub Environments)

Repo-Secret: `DEPLOY_ROLE_ARN` (OIDC-Rolle).

| Environment | Secrets |
|---|---|
| `staging` | `ENV_STAGING_JSON`, `APP_ENV_STAGING` |
| `demo` | `ENV_DEFAULT_JSON`, `APP_ENV_DEMO` |
| `prod` | `ENV_PROD_JSON`, `APP_ENV_PROD` |

Entsprechen den lokalen Dateien `projects/yogaswap/env.<workspace>.json` und `app/.env.<mode>`.

## Lokal

```bash
make -C projects/yogaswap deploy ENV=staging
make -C projects/yogaswap deploy ENV=default   # demo
make -C projects/yogaswap deploy ENV=prod
```

Nutzt denselben S3-Remote-State wie CI (`docs/opentofu-remote-state.md`).

## Provider-Lock

`projects/yogaswap/.terraform.lock.hcl` ist im Repo (AWS z. B. 6.56.0).
So holt CI nicht ungeprüft die neueste Provider-Version (6.57.0 hatte Prod-Deploy kaputtgemacht).
