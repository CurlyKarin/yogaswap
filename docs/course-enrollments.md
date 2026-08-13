# CourseEnrollments (Issue #302 / #293)

Stamm-Mitgliedschaft als **Segmente mit Gültigkeit**, parallel zu `course.participants[]` (Cache, vorerst behalten).

## DynamoDB

| Attribut | Typ | Schlüssel | Beschreibung |
|----------|-----|-----------|--------------|
| `tenantId` | S | PK | Tenant |
| `courseId_userId_validFrom` | S | SK | z. B. `1#luna#2026-03-10` |
| `courseId` | S | – | Kurs-ID (String, wie Overrides) |
| `courseIdNumeric` | N | – | Numerische Kurs-ID |
| `userId` | S | – | Nickname |
| `validFrom` | S | – | Erster gültiger Termin (`YYYY-MM-DD`) |
| `validUntil` | S | – | Optional, letzter gültiger Termin (inkl.) |
| `actorUserId` / `createdAt` / `closedAt` / `source` | S | – | Optional Audit |

**Zugriff:** `Query(tenantId, begins_with(SK, "{courseId}#"))`; Segmente einer Person: `begins_with(SK, "{courseId}#{userId}#")`.

Terraform: `module.course_enrollments_table` → `{project}-courseEnrollments-table`.  
Env: `COURSE_ENROLLMENTS_TABLE` (create/update/delete/get course Lambdas; Occupancy-Reads #303).

API: `GET /course-enrollments` (optional `?courseId=`).

## Regeln

- Add ab T → neues offenes Segment (`validFrom`, kein `validUntil`)
- Remove bis T → `validUntil` setzen (nicht löschen im Normalpfad)
- Rejoin → neues Segment, altes unverändert
- `validUntil` ist **inklusiv** (`stemOn` / `isEnrollmentActiveOnDate`)

## Migration / Seed

`migrateParticipantsToEnrollments` in `shared/courseEnrollment.ts`:

- Pro Eintrag in `participants[]` ein offenes Segment
- `validFrom` = `seriesStartDate` bzw. `visibleFrom`, sonst Sentinel `ENROLLMENT_OPEN_START` (`0001-01-01` = „schon immer“)
- `source`: `migration` | `seed` | …

Seed schreibt Enrollments aus denselben Kursdaten mit.

## Occupancy (#303)

```text
stemOn(T) = Segmente mit validFrom ≤ T ∧ (kein validUntil ∨ T ≤ validUntil)
effective = stemOn(T) ⊕ Override-Deltas (#291)
```

Shared:

- `stemOnDate` / `resolveStemForDate` — ohne Segmente für den Kurs → Fallback `course.participants`
- `resolveEffectiveTermOccupancy(course, override, enrollments, dateIso)`
- `resolveEffectiveTermParticipants(..., { stemParticipants })` — optionaler Stem-Override

Reads (App + Backend): Kachel, Wochenansicht, Swap-Ziele, `createSwap`, Override-Kapazität, Promotions.

## Shared API

- `buildCourseEnrollmentSortKey` / `parseCourseEnrollmentSortKey`
- `stemOnDate` / `isEnrollmentActiveOnDate` / `resolveStemForDate` / `resolveEffectiveTermOccupancy`
- `migrateParticipantsToEnrollments` / `openEnrollmentUserIds`

Backend: `courseEnrollmentDynamo.ts` (Put/Get/Query-Mapping).

## Nächste Schritte

- #304 Schreibpfade Add/Remove + Draft→Active
- #305 UI Teilnehmer mit Segmenten
- Später: `participants[]` entfernen
