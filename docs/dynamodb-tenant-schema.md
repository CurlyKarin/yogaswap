# DynamoDB-Schema mit tenantId (Multi-Tenancy)

Alle drei Tabellen nutzen `tenantId` im Partition Key, sodass jede Abfrage tenant-scoped ist. Es werden **keine neuen Tabellentypen** eingeführt (keine Room-/Studio-Tabellen).

## Hinweis: Schlüsseländerung = Tabellen-Ersatz

DynamoDB erlaubt keine Änderung von Partition- oder Sort-Key bestehender Tabellen. Das neue Schema erfordert daher den **Ersatz** der Tabellen (Terraform: `replace`). Vor dem ersten Apply mit dem neuen Schema:

- Bei **leeren** oder nur mit Seed befüllten Tabellen: Einfach `tofu apply` ausführen und danach `npm run seed` im Backend (Seed schreibt bereits mit `tenantId`).
- Bei **produktiven Daten**: Daten exportieren, Tabellen ersetzen, Daten mit `tenantId = "default-tenant"` (oder passender Tenant-ID) in das neue Schema importieren.

---

## 1. Courses

| Attribut      | Typ | Schlüssel     | Beschreibung |
|---------------|-----|---------------|--------------|
| tenantId      | S   | Hash (PK)     | Eindeutige Tenant-ID, z. B. `default-tenant` |
| courseId      | S   | Range (SK)    | Eindeutige Kurs-ID innerhalb des Tenants, z. B. `"1"`, `"2"` |
| id            | N   | –             | Numerische ID (kompatibel mit bestehendem Frontend/API) |
| name          | S   | –             | Kursname |
| weekday       | S   | –             | Wochentag (z. B. Mon, Tue) |
| time          | S   | –             | Uhrzeit (z. B. 19:30) |
| capacity      | N   | –             | Kapazität |
| participants  | L   | –             | Liste Teilnehmer (Strings) |
| dates         | L   | –             | Liste Termine (ISO-Datum) |

- **Zugriff:** `Query` mit `KeyConditionExpression: tenantId = :tid`. Einzelner Kurs: `Query(tenantId, courseId)`.

---

## 2. Course Overrides

| Attribut       | Typ | Schlüssel     | Beschreibung |
|----------------|-----|---------------|--------------|
| tenantId       | S   | Hash (PK)     | Tenant-ID |
| courseId_date  | S   | Range (SK)    | Zusammengesetzt: `courseId + "_" + date`, z. B. `"1_2026-01-26"` (Unterstrich, URL-tauglich) |
| courseId       | S   | –             | Kurs-ID (auch einzeln für Filter/Response) |
| date           | S   | –             | Datum (ISO) |
| participants   | L   | –             | Teilnehmer |
| swapped        | L   | –             | Getauschte |
| waitlist       | L   | –             | Warteliste |

- **Zugriff:** `Query(tenantId)`; optional `begins_with(courseId_date, courseId + "_")` für einen Kurs. Einzelner Override: `GetItem(tenantId, courseId + "_" + date)`.

---

## 3. Swaps

| Attribut                      | Typ | Schlüssel     | Beschreibung |
|------------------------------|-----|---------------|--------------|
| tenantId                      | S   | Hash (PK)     | Tenant-ID |
| user_swapId                  | S   | Range (SK)    | `user + "#" + swapId`, z. B. `Nia#2026-01-29_5_2026-01-28_4` |
| user                         | S   | –             | User (Nickname) |
| swapId                       | S   | –             | `fromDate_fromCourseId_toDate_toCourseId` |
| fromDate, fromCourseId       | S/N | –             | Quelle |
| toDate, toCourseId            | S/N | –             | Ziel |
| status                       | S   | –             | pending | active | cancelled |
| fromDate_fromCourseId_status | S   | –             | Für GSI_From |
| toDate_toCourseId_status     | S   | –             | Für GSI_To |
| tenantId_user                 | S   | –             | `tenantId + "#" + user` für GSI_From / GSI_To |

**GSI_From:** PK = `tenantId_user` (S), SK = `fromDate_fromCourseId_status` (S)  
**GSI_To:**   PK = `tenantId_user` (S), SK = `toDate_toCourseId_status` (S)

- **Zugriff:**
  - Alle Swaps eines Users: `Query(tenantId, begins_with(user_swapId, user + "#"))`.
  - Nach From-Ziel: Query über **GSI_From** mit `tenantId_user = tenantId + "#" + user` und `begins_with(fromDate_fromCourseId_status, fromDate + "_" + fromCourseId)`.
  - Nach To-Ziel: Query über **GSI_To** mit `tenantId_user` und `begins_with(toDate_toCourseId_status, ...)`.
  - Nach Status: `Query(tenantId)` + `FilterExpression: status = :status`.
- **Schreibzugriffe:** Immer mit `tenantId` und `user_swapId` als Table-Key.

---

## Konventionen

- **tenantId:** Immer aus dem Request-Kontext (z. B. JWT oder Default) und in **jeder** DynamoDB-Operation (Query/Get/Put/Update/Delete) verwenden.
- **courseId:** In Courses und Overrides als **String** im Key (SK bzw. courseId_date), numerisch weiterhin als Attribut `id` (Courses) bzw. `courseId` (Overrides) für API-Kompatibilität.
- **swapId:** Unverändert `fromDate_fromCourseId_toDate_toCourseId`; Sort-Key der Tabelle ist `user_swapId = user + "#" + swapId`.

Dieses Dokument dient als Referenz für Terraform, Seed und alle Lambdas.

---

## Migration bestehender Daten

Wenn bereits Daten in den **alten** Tabellen (Keys ohne tenantId) liegen:

1. **Vor dem Terraform-Apply:** Tabellen ersetzen (Terraform plant `replace`), dadurch gehen bestehende Daten verloren, sofern nicht migriert.
2. **Option A – Neu aufsetzen:** Tabellen ersetzen, danach im Backend `npm run seed` ausführen (Seed schreibt mit `tenantId = "default-tenant"`).
3. **Option B – Daten mitnehmen:** Vor dem Apply Daten aus den alten Tabellen exportieren (z. B. Scan + Speicherung als JSON). Nach dem Apply ein Migrationsskript ausführen, das jedes Item mit `tenantId = "default-tenant"` und den neuen Keys (courseId, courseId_date, user_swapId, tenantId_user) in die neuen Tabellen schreibt.
