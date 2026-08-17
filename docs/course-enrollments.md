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

`validUntil` ist **inklusiv**. Segmente derselben Person im selben Kurs dürfen sich **nicht überschneiden**. Benachbart (`bis 10.`, `ab 17.`) ist erlaubt.

Eine Zeile ist identisch über den Sort Key `courseId#userId#validFrom`. **Ändern** = Put auf denselben Key. **Neu** = anderer `validFrom` → neue Zeile; die alte bleibt stehen.

| Aktion im Dialog | Wann | Schreibweise |
|------------------|------|----------------|
| Neu zuordnen / kommt | Kein Segment vorhanden, oder letztes Segment **beendet vor** neuem Start (`validUntil < validFrom`) | **Neue** offene Zeile |
| Austritt / Bis setzen | Offenes Segment, oder Korrektur einer schon geschlossenen Zeile | **Bestehende** Zeile: `validUntil` setzen |
| Bis korrigieren (früher/später) | Dieselbe Mitgliedschaft, nur anderes Ende | **Bestehende** Zeile überschreiben, **keine** zweite Zeile |
| Ende zurücknehmen | Offenes `validUntil` an derselben Zeile entfernen | **Bestehende** Zeile ohne `validUntil` |
| Wieder aufnehmen | Nach echter Lücke: `validFrom` **nach** dem letzten `validUntil` (in der Vergangenheit) | **Neue** offene Zeile; alte Zeile bleibt als Historie |
| Kommt entfernen | Offenes Segment mit Start in der Zukunft, noch kein Termin besucht | **Zeile löschen**, kein `validUntil` vor `validFrom` |
| Ab-Datum einer kommenden Mitgliedschaft | Offenes Segment, anderer Start | Alte Zeile schließen (Tag vor neuem Start), **dann** neue offene Zeile |

Kein zweites Segment, wenn das neue `validFrom` noch im Zeitraum einer bestehenden Zeile liegt — dann nur diese Zeile anpassen (typisch: Bis-Korrektur, nicht Wiederaufnahme).

### Invarianten (vom Code durchgesetzt)

1. **Kein Overlap** – `enrollmentRangesOverlap(a, b)` verhindert das Anlegen einer neuen Zeile, wenn sie eine bestehende Zeile derselben Person überlappt.
2. **Clamp bei Korrektur** – `clampUntilToAvoidOverlap` begrenzt ein neues `validUntil` so, dass es nicht in eine spätere Zeile derselben Person hineinragt.
3. **Wieder aufnehmen nur nach realem Austritt** – Der Dialog erlaubt „Wieder aufnehmen" nur für Personen in der **Ehemalig-Liste** (letztes `validUntil` liegt in der Vergangenheit). Geplante Pausen (Austritt in Zukunft + geplanter Wiedereintritt) sind ein separates Feature.
4. **`validUntil` wird am selben Segment korrigiert** – `findLatestEnrollmentForUser` stellt sicher, dass die Korrektur immer die zuletzt angelegte Zeile trifft, egal ob offen oder schon geschlossen.
5. **Historie bleibt erhalten** – Geschlossene Segmente werden nie gelöscht; `stemOn(T)` für vergangene Termine bleibt damit korrekt.
6. **Austritt vor Kursstart** – Ein Segment, das noch nicht begonnen hat (`validUntil` würde vor `validFrom` liegen), wird **gelöscht**, nicht mit einem umgedrehten Intervall geschlossen.

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

Der Dialog betrachtet den **aktuellen Zeitpunkt**. Die aktuellste Stamm-Information ist der **nächste noch offene Kurstermin R** (`stemOn(R)`), nicht das Kalenderdatum.

Ein Termin ist **geschlossen** (zählt nicht als R), sobald die Startzeit erreicht/vorbei ist **oder** das Cutoff-Fenster läuft (Studio-Einstellung, Default 60 Min. vor Beginn; Cutoff 0: nur gestartet/vergangen). R = frühester noch offener Termin; sonst letzter geschlossener. Inactive: letzter Kurstermin der Serie.

Die Kurskarte bleibt bei `stemOn(T) ⊕ Deltas` für den **angezeigten** Termin, unabhängig von R. `validFrom` / `validUntil` sind Kurstermine.

| Status | UI |
|--------|----|
| **Draft** | Flache Liste, **Klick** ordnet zu/ab. Keine ab/bis-Daten. Kopfzeile `Zugeordnet n / max`. |
| **Active** | Dabei / endet / kommt. **Kein** Verschieben per Klick. Aufnehmen nur über **ab**-Datum (nächster offener Termin und später). Beenden nur über **bis**-Datum (letzter geschlossener Termin oder R/später). |
| **Inactive** | Nur Anzeige (Historie). Kein „kommt“, keine ab/bis-Auswahl, kein Speichern. Änderungen nur nach Reaktivierung über Draft. |

- `n/max` = Dabei an R (`stemOn(R)`), inkl. Personen mit `validUntil` solange `R ≤ validUntil`
- Kommt zählen nicht in `n`
- Kopfzeile z. B. `Teilnehmer 6/6 · 2 enden · 2 kommen neu dazu` (ohne Daten)
- Obere Liste immer offen; untere Liste (nicht dabei / ehemals) eingeklappt
- Speichern (nur Draft/Active) sendet `participants[]` (Dabei + Kommt) und `enrollmentChanges[]` (`add`/`remove` + `dateIso`). Inactive: kein Speichern; `updateCourse` lehnt Mitglieder-Patches ab.
- Remove mit letztem Termin (`validUntil < R`) nimmt die Person aus dem nächsten Termin (Ehemalige)
- „endet“ = noch Stamm an R, aber `validUntil` gesetzt (letzter Termin = R oder später)
- **Vergangenes Ende** (`validUntil < R`) ist in der unteren Liste nur Anzeige, nicht editierbar. Wiederaufnahme: neues **ab** nach dem letzten `validUntil` (neues Segment).

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
- `planStemEnrollmentWrites` / `buildOpenEnrollment` / `closeEnrollmentSegment` / `findOpenEnrollmentForUser` / `enrollmentRangesOverlap`
- `classifyMembersForDialog` / `formatMembersDialogHeadline` / `enrollmentChangesToDateMaps`

Backend: `courseEnrollmentDynamo.ts` (Put/Get/Query-Mapping).

## Nächste Schritte

- Später: `participants[]` entfernen
