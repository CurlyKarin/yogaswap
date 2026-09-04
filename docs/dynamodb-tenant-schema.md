# DynamoDB-Schema mit tenantId (Multi-Tenancy)

Alle Kern-Tabellen nutzen `tenantId` im Partition Key, sodass jede Abfrage tenant-scoped ist.

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
| participants  | L   | –             | Stamm-Cache: **Nicknames** (#317 hybrid; UUID nur am Profil) |
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
| participants   | L   | –             | Legacy-Snapshot; Delta-Felder nutzen **Nicknames** |
| swapped        | L   | –             | Getauschte (Nicknames) |
| waitlist       | L   | –             | Warteliste (Nicknames) |

- **Zugriff:** `Query(tenantId)`; optional `begins_with(courseId_date, courseId + "_")` für einen Kurs. Einzelner Override: `GetItem(tenantId, courseId + "_" + date)`.

---

## 3. Swaps

| Attribut                      | Typ | Schlüssel     | Beschreibung |
|------------------------------|-----|---------------|--------------|
| tenantId                      | S   | Hash (PK)     | Tenant-ID |
| user_swapId                  | S   | Range (SK)    | `nickname + "#" + swapId` (#317 hybrid) |
| participantId                | S   | –             | Operativ: Nickname (Feldname historisch) |
| user                         | S   | –             | Legacy-Alias zum Nickname |
| swapId                       | S   | –             | `fromDate_fromCourseId_toDate_toCourseId` |
| fromDate, fromCourseId       | S/N | –             | Quelle |
| toDate, toCourseId            | S/N | –             | Ziel |
| status                       | S   | –             | pending | active | cancelled |
| fromDate_fromCourseId_status | S   | –             | Für GSI_From |
| toDate_toCourseId_status     | S   | –             | Für GSI_To |
| tenantId_user                 | S   | –             | `tenantId + "#" + nickname` für GSI_From / GSI_To |

**GSI_From:** PK = `tenantId_user` (S), SK = `fromDate_fromCourseId_status` (S)  
**GSI_To:**   PK = `tenantId_user` (S), SK = `toDate_toCourseId_status` (S)

- **Zugriff:**
  - Alle Swaps einer Person: `Query(tenantId, begins_with(user_swapId, nickname + "#"))`.
  - Nach From-Ziel: Query über **GSI_From** mit `tenantId_user = tenantId + "#" + nickname` und `begins_with(fromDate_fromCourseId_status, fromDate + "_" + fromCourseId)`.
  - Nach To-Ziel: Query über **GSI_To** mit `tenantId_user` und `begins_with(toDate_toCourseId_status, ...)`.
  - Nach Status: `Query(tenantId)` + `FilterExpression: status = :status`.
- **Schreibzugriffe:** Immer mit `tenantId` und `user_swapId` als Table-Key.

---

## 4. Course Enrollments (Stamm-Segmente)

Siehe auch [course-enrollments.md](./course-enrollments.md) (#302 / #293).

| Attribut | Typ | Schlüssel | Beschreibung |
|----------|-----|-----------|--------------|
| tenantId | S | Hash (PK) | Tenant-ID |
| courseId_userId_validFrom | S | Range (SK) | `courseId#nickname#validFrom` (Attributname historisch) |
| courseId | S | – | Kurs-ID (String) |
| courseIdNumeric | N | – | Numerische Kurs-ID |
| participantId | S | – | Operativ: Nickname (#317 hybrid; Feldname historisch) |
| userId | S | – | **Legacy** — Nickname |
| validFrom | S | – | Erster gültiger Termin |
| validUntil | S | – | Optional letzter gültiger Termin (inkl.) |

- **Zugriff:** `Query(tenantId)` mit `begins_with(courseId_userId_validFrom, courseId + "#")`.
- **Nicht** die Tenant-`Memberships`-Tabelle (Rollen).

---

## 5. Participants (Profile & Membership)

| Attribut | Typ | Schlüssel | Beschreibung |
|----------|-----|-----------|--------------|
| tenantId | S | Hash (PK) | Tenant-ID |
| userId | S | Range (SK) | Nickname (Anzeige, Login, Admin) |
| participantId | S | – | Stabile UUID pro Tenant (#317) |
| authUserId | S | – | Cognito `sub` (optional, #324) |
| … | | | weitere Profil-/Membership-Felder |

**GSI_ParticipantId:** PK `tenantId`, SK `participantId` — Lookup ohne Nickname.

Neue Mitglieder erhalten `participantId` (UUID) am Profil beim Anlegen; Backfill nur Profile/Memberships: `npm run backfill:participant-ids` (Ops bleiben Nicknames). UUID→Nickname in Ops: `npm run backfill:operational-nicknames`.

---

## Konventionen

- **tenantId:** Immer aus dem Request-Kontext (z. B. JWT oder Default) und in **jeder** DynamoDB-Operation (Query/Get/Put/Update/Delete) verwenden.
- **courseId:** In Courses und Overrides als **String** im Key (SK bzw. courseId_date), numerisch weiterhin als Attribut `id` (Courses) bzw. `courseId` (Overrides) für API-Kompatibilität.
- **Operative Personen-Refs (#317 hybrid):** In Swaps, Kurs-Caches, Overrides und Enrollments = **Nickname**. Stabile UUID nur am Profil (`GSI_ParticipantId`).
- **swapId:** Unverändert `fromDate_fromCourseId_toDate_toCourseId`; Sort-Key der Tabelle ist `user_swapId = nickname + "#" + swapId`.

Dieses Dokument dient als Referenz für Terraform, Seed und alle Lambdas.

---

## Migration bestehender Daten

Wenn bereits Daten in den **alten** Tabellen (Keys ohne tenantId) liegen:

1. **Vor dem Terraform-Apply:** Tabellen ersetzen (Terraform plant `replace`), dadurch gehen bestehende Daten verloren, sofern nicht migriert.
2. **Option A – Neu aufsetzen:** Tabellen ersetzen, danach im Backend `npm run seed` ausführen (Seed schreibt mit `tenantId = "default-tenant"`).
3. **Option B – Daten mitnehmen:** Vor dem Apply Daten aus den alten Tabellen exportieren (z. B. Scan + Speicherung als JSON). Nach dem Apply ein Migrationsskript ausführen, das jedes Item mit `tenantId = "default-tenant"` und den neuen Keys (courseId, courseId_date, user_swapId, tenantId_user) in die neuen Tabellen schreibt.

Für **CourseEnrollments** aus bestehenden `course.participants`: Shared-Helfer `migrateParticipantsToEnrollments` bzw. Seed. Die Tabelle ist neu (kein Key-Replace einer bestehenden Tabelle).
