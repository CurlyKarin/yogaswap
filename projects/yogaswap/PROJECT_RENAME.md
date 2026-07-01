# OpenTofu `project`-Rename – Plan & Risikoabschätzung (#74, aktualisiert #248)

Der `default`-Workspace betreibt die **Demo** unter dem Ressourcen-Präfix
`yogaswap-demo` (siehe `env.tf`). Der echte **prod**-Stack ist ein separater
Workspace `prod` mit Präfix `yogaswap-prod` (#248) – kein In-place-Rename.

**Kurzfazit:** Ein In-place-Rename des `project`-Werts im bestehenden Stack ist
**kein** einfacher Edit – er ersetzt praktisch die gesamte Infrastruktur (inkl.
Datenverlust) und sollte **vermieden** werden. Stattdessen: Demo-Stack
(`yogaswap-demo`) behalten, prod frisch als `yogaswap-prod` daneben aufbauen.

## Warum ein Rename teuer ist

Der `project`-Wert ist Namensbestandteil fast aller Ressourcen
(`${project}-...`). Ändert man ihn, sind die meisten Ressourcen für Terraform
**neue** Ressourcen → `destroy` + `create` (Replace), nicht `update`.

| Ressource | Effekt bei Rename | Folge |
|---|---|---|
| DynamoDB-Tabellen (`*-swaps/courses/courseOverrides/tenants/memberships/participants/auth-tokens-table`) | Replace | **Datenverlust** (alle Kurse, Tausche, Mitgliedschaften, Teilnehmerprofile) |
| Cognito User Pool (`${project}-users`) | Replace | **Alle Nutzer/Logins weg**, neue Pool-/Client-IDs → Frontend-Rebuild nötig |
| Cognito App Client / Groups | Replace | Neue Client-ID, Gruppen neu |
| S3-Bucket (`${project}-site`) | Replace | Bucket-Name global eindeutig → neuer Bucket, Re-Upload |
| Lambdas (`${project}-*`) | Replace | Neue Funktionsnamen/ARNs |
| API Gateway (`${project}-api`) | Replace | Neue API-Domain → CloudFront-Origin/Behaviors anpassen |
| CloudFront Distribution | Update/Replace | Origin ändert sich; Alias/Cert müssen mitgezogen werden |
| IAM-Rollen/Policies | Replace | Neue Rollen |

Kurz: Ein Rename ≈ Neuaufbau der Umgebung mit Datenmigration.

## Empfohlener Weg (seit #248)

| Workspace | Präfix | `Environment`-Tag | Rolle |
|---|---|---|---|
| `default` | `yogaswap-demo` | `demo` | Demo / LinkedIn-Link |
| `staging` | `yogaswap-staging` | `staging` | Entwicklung & Tests |
| `prod` | `yogaswap-prod` | `prod` | Echte Studios |

Der Ressourcen-Präfix ist ein **Implementierungsdetail** – Endnutzer sehen die
Domain (`app.yogaswap.de` für prod, ggf. `demo.app.yogaswap.de` für Demo).

Setup-Anleitung: `FRESH_SETUP.md` Abschnitt „prod anlegen".

## Falls ein Rename doch zwingend ist (Migrations-Variante)

Dann **kein** In-place-Rename, sondern ein kontrollierter Umzug im
Rollout-Fenster:

1. Neuen Workspace/Stack mit Zielnamen anlegen (`env.tf` erweitern), parallel zu prod.
2. Daten migrieren (DynamoDB Export/Import bzw. gezieltes Backfill), Cognito-Nutzer
   migrieren (Pool-Migration ist aufwändig – ggf. Neueinladung statt Migration).
3. Frontend mit neuen Cognito-IDs bauen und auf den neuen Stack deployen.
4. DNS (IONOS) auf die neue CloudFront-Distribution umstellen (kurze TTL vorab).
5. Alten Stack erst nach erfolgreicher Verifikation abbauen.

**Pflicht vor jeder Aktion:** `tofu plan` reviewen und die Replace-/Destroy-Zeilen
explizit prüfen (insb. DynamoDB/Cognito) – nie blind `apply`.

## Migrations-/Backfill-Skripte für Go-Live

Status der vorhandenen Skripte (`backend/src/scripts/`):

- `seed/index.ts`, `seed_tenants.ts`: Seeds für Demo-/Testdaten. Für ein echtes
  Studio **nicht** nötig (Daten entstehen über die UI). Nur für frische
  Test-/Demo-Umgebungen. Seit #74 fail-fast ohne Demo-Fallback.
- `backfill_participant_profiles.ts`: einmaliger Backfill (Teilnehmerprofile /
  `userIdNormalized`). Nur relevant für bestehende Datenbestände; für ein frisch
  aufgesetztes Studio nicht erforderlich.
- `backfill_course_uids.ts`: einmaliger Backfill (Course-UIDs). Wie oben.
- `migrate_users.ts`: einmaliges Cognito→Memberships-Migrationsskript. Für
  Go-Live eines neuen Studios nicht nötig; seit #74 env-gesteuert (fail-fast).
- `create_tenant.ts`: Tenant + Admin-Membership idempotent anlegen (#53).

→ Für den Go-Live eines **neuen** Studios werden **keine** Backfill-Skripte
benötigt. `create-tenant` / `bootstrap-admin` decken den Erst-Setup ab.
