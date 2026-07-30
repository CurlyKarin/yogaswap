# Tenant-Host und Subdomain (#249 / #261)

## Konvention

| Hostname | `tenantId` |
|---|---|
| `app.yogaswap.de` (Apex) | `default-tenant` (Fallback) |
| `{label}.app.yogaswap.de` | `{label}` (z. B. `beharmony`) |
| `demo.yogaswap.de` / localhost | Fallback aus `VITE_DEFAULT_TENANT_ID` |

Frontend setzt `x-tenant-id` in `app/src/main.tsx` via `resolveTenantIdFromHostname`
(`shared/src/tenantHost.ts`). Backend liest nur den Header (keine Hostname-Auflösung).

## Unbekanntes Studio (#261)

Existiert der Tenant nicht in DynamoDB (`…-tenants-table`):

- `GET /tenant-context` → **400** `{ error: "tenant_not_found", tenantId }`
  (kein 404: CloudFront mappt 404 → `index.html` für die SPA)
- Die Route ist **ohne JWT** erreichbar (Studio-Check vor Login)
- Frontend zeigt „Studio nicht gefunden“ statt Login

Löschen eines Studio-Eintrags entfernt **nicht** DNS/CloudFront — die Subdomain
liefert weiter die SPA, aber mit Fehlerseite.

## Cognito-Callbacks

Login per Amplify SRP (kein Hosted-UI-Redirect). Callback-URLs bleiben Apex + localhost;
Wildcard-Subdomains sind in Cognito nicht nötig, solange kein OAuth-Redirect genutzt wird.
