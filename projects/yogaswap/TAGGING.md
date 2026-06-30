# AWS-Tagging-Konvention (#16)

Verbindliche Tags für alle Umgebungen (`demo`, `staging`, `prod`). Sie ermöglichen
Kostenzuordnung pro Umgebung, saubere Filter in Cost Explorer/CloudWatch und eine
klare Ownership-Sicht.

## Wie es umgesetzt ist

Die Tags werden **zentral** über `default_tags` im AWS-Provider gesetzt
(`main.tf` → `provider "aws"`), gespeist aus `local.common_tags` (`env.tf`). Dadurch
landen sie automatisch auf **allen taggable Ressourcen** – auch denen aus Modulen.
Es muss kein Tag pro Ressource manuell gepflegt werden.

Die Umgebung kommt aus dem aktiven OpenTofu-Workspace
(`local.environment`, gemappt in `env.tf`):

| Workspace | `Environment`-Tag | Präfix (`project`) |
|---|---|---|
| `default`  | `demo`    | `yogaswap-demo`    |
| `staging`  | `staging` | `yogaswap-staging` |
| `prod`     | `prod`    | `yogaswap-prod` (kommt mit #248) |

## Pflicht-Tags

| Tag | Wert | Quelle |
|---|---|---|
| `Project`     | `yogaswap`            | fest in `env.tf` |
| `Environment` | `demo`/`staging`/`prod` | `local.environment` (Workspace) |
| `ManagedBy`   | `terraform`           | fest in `env.tf` |

## Optionale Tags

Werden nur gesetzt, wenn in `env.<workspace>.json` (gitignored) ein **nicht-leerer**
Wert hinterlegt ist:

| Tag | JSON-Key |
|---|---|
| `Owner`      | `owner` |
| `CostCenter` | `cost_center` |

## Pflege

- Neue Umgebung: Eintrag in `env_public` (`env.tf`) inkl. `environment` ergänzen –
  Tags greifen dann automatisch.
- Vor `apply` auf bestehenden Stacks erzeugt die Tag-Einführung einen reinen
  Tag-Diff (kein Replace). Mit `make plan ENV=<env>` reviewen, dann `make deploy`
  bzw. `make apply`.
