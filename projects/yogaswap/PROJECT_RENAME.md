# OpenTofu `project`-Rename – Plan & Risikoabschätzung (#74)

Der `default`-Workspace betreibt prod unter dem Ressourcen-Präfix
`yogaswap-demo` (siehe `env.tf`, `local.project`). Vor dem ersten echten
Studio-Rollout stellt sich die Frage, ob dieser Demo-Name umbenannt werden soll.

**Kurzfazit:** Ein In-place-Rename des `project`-Werts ist **kein** einfacher
Edit – er ersetzt praktisch die gesamte Infrastruktur (inkl. Datenverlust) und
sollte **vermieden** werden. Empfehlung: den internen Präfix `yogaswap-demo`
beibehalten und nur über Domain/Anzeige nach außen auftreten.

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

## Empfohlener Weg: NICHT umbenennen

Der Ressourcen-Präfix ist ein **Implementierungsdetail** und für Endnutzer
unsichtbar – sie sehen nur die Domain (`app.yogaswap.de`, Studio-Subdomains).

- `default`/prod behält `yogaswap-demo` als Präfix (kein Replace, kein Risiko).
- Der „echte" Auftritt erfolgt über Domain + Studio-/Tenant-Namen (siehe #61).
- Neue Umgebungen (staging etc.) bekommen ohnehin eigene Präfixe über den
  Workspace (`env.tf`).

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

→ Für den Go-Live eines **neuen** Studios werden **keine** dieser Skripte
benötigt. Sie bleiben als einmalige Migrationswerkzeuge erhalten.
