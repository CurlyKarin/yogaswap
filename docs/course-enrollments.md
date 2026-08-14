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
Env: `COURSE_ENROLLMENTS_TABLE` (create/update/delete/get course Lambdas; Occupancy-Reads #303; Writes #304).

API: `GET /course-enrollments` (optional `?courseId=`).

## Regeln

- Add ab T → neues offenes Segment (`validFrom`, kein `validUntil`)
- Remove bis T → `validUntil` setzen (nicht löschen im Normalpfad); Korrektur schreibt dasselbe Segment erneut (auch wenn es schon geschlossen ist)
- Rejoin → neues Segment, altes unverändert
- `validUntil` ist **inklusiv** (`stemOn` / `isEnrollmentActiveOnDate`)

## Schreibpfade (#304)

`updateCourse` mit `participants[]` (und Draft→Active):

1. Bestehende Segmente laden; Tabelle leer → Bootstrap aus bisherigem Stamm (`source: migration`)
2. **Add:** neues offenes Segment  
   - Active: `validFrom` = nächster Kurstermin (sonst heute)  
   - Draft: `validFrom` = `seriesStartDate` / `visibleFrom` / Sentinel
3. **Remove:** Segment schließen bzw. `validUntil` korrigieren (offenes oder bereits geschlossenes Segment, inklusiv). Default = letzter geschlossener Kurstermin (Cutoff/laufend/vergangen). Fallback ohne solchen Termin: heute.
4. `course.participants[]` bleibt Cache der offenen Stamm-Liste (UI unverändert)
5. Override-/Swap-Cleanup bei Active bleibt (zukünftige Termine)

## Mitglieder-Dialog (#305)

Referenz **R = nächster offener Kurstermin** (noch nicht im Cutoff-Fenster, noch nicht gestartet).  
Inactive: letzter Kurstermin. Die Kurskarte bleibt bei `stemOn(T) ⊕ Deltas` für den **angezeigten** Termin.

Cutoff/laufender Termin zählt als **vergangen**. `validFrom` / `validUntil` sind Kurstermine, kein Kalender-„heute“.

| Status | UI |
|--------|----|
| **Draft** | Flache Liste, keine ab/bis-Daten. Kopfzeile `Zugeordnet n / max`. |
| **Active** | Dabei / endet / kommt am nächsten offenen Termin. Add default = dieser Termin; Remove default = letzter (geschlossener) Termin. |
| **Inactive** | Kein „kommt“, keine Neuplanung über den Dialog. |

- `n/max` = Dabei an R (`stemOn(R)`), inkl. Personen mit `validUntil` solange `R ≤ validUntil`
- Kommt zählen nicht in `n`
- Kopfzeile z. B. `Teilnehmer 6/6 · 2 enden · 2 kommen neu dazu` (ohne Daten)
- Obere Liste immer offen; untere Liste (nicht dabei / ehemals) eingeklappt
- Speichern sendet `participants[]` (Dabei + Kommt) und `enrollmentChanges[]` (`add`/`remove` + `dateIso`)
- Remove mit letztem Termin (`validUntil < R`) nimmt die Person aus dem nächsten Termin (Ehemalige)
- „endet“ = noch Stamm an R, aber `validUntil` gesetzt (letzter Termin = R oder später)

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

Ohne Segmente für den Kurs → Fallback `course.participants`.

## Shared API

- `buildCourseEnrollmentSortKey` / `parseCourseEnrollmentSortKey`
- `stemOnDate` / `isEnrollmentActiveOnDate` / `resolveStemForDate` / `resolveEffectiveTermOccupancy`
- `migrateParticipantsToEnrollments` / `openEnrollmentUserIds`
- `planStemEnrollmentWrites` / `buildOpenEnrollment` / `closeEnrollmentSegment` / `findOpenEnrollmentForUser`
- `classifyMembersForDialog` / `formatMembersDialogHeadline` / `enrollmentChangesToDateMaps`

Backend: `courseEnrollmentDynamo.ts` (Put/Get/Query-Mapping).

## Nächste Schritte

- Später: `participants[]` entfernen
