# CourseEnrollments (Issue #302 / #293, #317 hybrid)

Stamm-Mitgliedschaft als **Segmente mit Gültigkeit**. `course.participants[]` ist je nach Status **Planungsliste** (Draft) oder **Cache** `stemOn(R)` (Active) — keine parallele Wahrheit (#384 / #361).

## DynamoDB

| Attribut | Typ | Schlüssel | Beschreibung |
|----------|-----|-----------|--------------|
| `tenantId` | S | PK | Tenant |
| `courseId_userId_validFrom` | S | SK | z. B. `1#luna#2026-03-10` (Attributname historisch; Wert = Nickname) |
| `courseId` | S | – | Kurs-ID (String, wie Overrides) |
| `courseIdNumeric` | N | – | Numerische Kurs-ID |
| `participantId` | S | – | **Operativ:** Nickname in Kurs-Referenzen; Feldname historisch (#317) |
| `userId` | S | – | **Legacy** — Nickname; Reader-Fallback |
| `validFrom` | S | – | Erster gültiger Termin (`YYYY-MM-DD`) |
| `validUntil` | S | – | Optional, letzter gültiger Termin (inkl.) |
| `actorUserId` / `createdAt` / `closedAt` / `source` | S | – | Optional Audit |

**Zugriff:** `Query(tenantId, begins_with(SK, "{courseId}#"))`; Segmente einer Person: `begins_with(SK, "{courseId}#{nickname}#")`.

Stabile UUID `participantId` liegt nur am **Profil** (GSI `GSI_ParticipantId`); operative Kurs-Refs bleiben Nicknames (#317 hybrid).

Terraform: `module.course_enrollments_table` → `{project}-courseEnrollments-table`.  
Env: `COURSE_ENROLLMENTS_TABLE` (create/update/delete/get course Lambdas; Occupancy-Reads #303; Writes #304).

API: `GET /course-enrollments` (optional `?courseId=`). Response-Felder: `participantId` (Legacy `userId` wird beim Lesen gemappt).

## Regeln

`validUntil` ist **inklusiv**. Segmente derselben Person im selben Kurs dürfen sich **nicht überschneiden**. Benachbart (`bis 10.`, `ab 17.`) ist erlaubt.

Eine Zeile ist identisch über den Sort Key `courseId#participantId#validFrom`. **Ändern** = Put auf denselben Key. **Neu** = anderer `validFrom` → neue Zeile; die alte bleibt stehen.

| Aktion im Dialog | Wann | Schreibweise |
|------------------|------|----------------|
| Neu zuordnen / kommt | Kein Segment vorhanden, oder letztes Segment **beendet vor** neuem Start (`validUntil < validFrom`) | **Neue** offene Zeile |
| Austritt / Bis setzen | Offenes Segment, oder Korrektur einer schon geschlossenen Zeile | **Bestehende** Zeile: `validUntil` setzen |
| Bis korrigieren (früher/später) | Dieselbe Mitgliedschaft, nur anderes Ende | **Bestehende** Zeile überschreiben, **keine** zweite Zeile |
| Austritt zurücknehmen | `validUntil` **≥ R** (noch Dabei/endet) | **Bestehende** Zeile: `validUntil` entfernen |
| Wieder aufnehmen | Letztes `validUntil` **&lt; R** (Ehemalig): `validFrom` **nach** dem letzten `validUntil` | **Neue** offene Zeile; alte Zeile bleibt als Historie — nie `validUntil` der alten Zeile löschen |
| Kommt entfernen | Offenes Segment mit Start in der Zukunft, noch kein Termin besucht | **Zeile löschen**, kein `validUntil` vor `validFrom` |
| Ab-Datum einer kommenden Mitgliedschaft | Offenes Segment, anderer Start | Alte Zeile schließen (Tag vor neuem Start), **dann** neue offene Zeile |

Kein zweites Segment, wenn das neue `validFrom` noch im Zeitraum einer bestehenden Zeile liegt — dann nur diese Zeile anpassen (typisch: Bis-Korrektur, nicht Wiederaufnahme).

### Invarianten (vom Code durchgesetzt)

1. **Kein Overlap** – `enrollmentRangesOverlap(a, b)` verhindert das Anlegen einer neuen Zeile, wenn sie eine bestehende Zeile derselben Person überlappt.
2. **Clamp bei Korrektur** – `clampUntilToAvoidOverlap` begrenzt ein neues `validUntil` so, dass es nicht in eine spätere Zeile derselben Person hineinragt.
3. **Wieder aufnehmen nur nach realem Austritt** – Der Dialog erlaubt „Wieder aufnehmen" nur für Personen in der **Ehemalig-Liste** (`validUntil` &lt; R). Dann neues Segment; die Historie bleibt. Bis auf „offen“ (Reopen derselben Zeile) nur solange `validUntil` ≥ R. Geplante Pausen (Austritt + Rückkehr beide in der Zukunft) sind #309.
4. **`validUntil` wird am selben Segment korrigiert** – `findLatestEnrollmentForParticipant` stellt sicher, dass die Korrektur immer die zuletzt angelegte Zeile trifft, egal ob offen oder schon geschlossen.
5. **Historie bleibt erhalten** – Geschlossene Segmente werden nie gelöscht; `stemOn(T)` für vergangene Termine bleibt damit korrekt.
6. **Austritt vor Kursstart** – Ein Segment, das noch nicht begonnen hat (`validUntil` würde vor `validFrom` liegen), wird **gelöscht**, nicht mit einem umgedrehten Intervall geschlossen.

## Schreibpfade (#304)

`updateCourse` mit `participants[]` / Status:

1. **Draft:** nur Planungsliste (`participants[]`) — **keine** Enrollment-Writes. Vorhandene offene Segmente werden entfernt (Cleanup). Geschlossene Historie (#381) bleibt.
2. **Active:** Segmente laden; Tabelle leer → Bootstrap aus bisherigem Stamm (`source: migration`)
3. **Add (Active):** neues offenes Segment, `validFrom` = nächster Kurstermin (sonst heute)
4. **Remove (Active):** Segment schließen bzw. `validUntil` korrigieren (offenes oder bereits geschlossenes Segment, inklusiv). Default = letzter geschlossener Kurstermin (Cutoff/laufend/vergangen). Fallback ohne solchen Termin: heute.
5. **Active (#384):** nach Enrollment-Sync wird `course.participants[]` serverseitig aus `stemOn(R)` abgeleitet (Body nur Diff-Input, keine parallele Wahrheit).
6. Override-/Swap-Cleanup bei Active bleibt (zukünftige Termine)

### inactive → draft / Planungsliste (#381)

Beim Statuswechsel **inactive → draft** (Wiederbeplanung):

1. Offene Segmente schließen mit `validUntil` = **Blockende** (`courseBlockEndIso`: `seriesEndDate` bzw. `plannedEndDate`)
2. **Planungsliste** (`participants[]`) = Vorschlag `stemOn(Blockende)` nach dem Schließen — Abgemeldete mit früherem `validUntil` sind nicht dabei
3. Ohne Enrollment-Zeilen: bisherige `participants[]` als Legacy-Fallback behalten
4. Expliziter `participants`-Patch im Request überschreibt den Vorschlag
5. Neue offene Segmente für den nächsten Block entstehen erst bei **draft → active** (#382)

### draft → active / Materialisierung (#382)

Beim Statuswechsel **draft → active**:

1. Offene Segmente (falls noch aus altem Draft-Sync) werden gelöscht — Planungsliste ist die Vorlage
2. Für jede Person auf der **Planungsliste** → neues offenes Segment (`source: reactivation`), sofern nach Cleanup keines offen ist
3. `validFrom` = Serienstart / `visibleFrom` (`resolveMigrationValidFrom`); Fallback nächster offener Termin / heute. Bei geschlossener Historie: frühestens Tag nach letztem `validUntil`
4. Geschlossene Historie (#381) bleibt; danach setzt #384 den Active-Cache aus `stemOn(R)`
5. Draft-UI unverändert flach (keine ab/bis)

### Planungsliste (Draft) vs. Cache (Active) (#384)

| Status | `course.participants[]` | Wahrheit |
|--------|-------------------------|----------|
| **draft** | **Planungsliste** — editierbar; Vorlage für draft→active; **keine** Enrollments | Liste selbst |
| **active** | **Cache** = `stemOn(R)` — nur Ableitung nach Writes | CourseEnrollments |
| **inactive** | ggf. Legacy/Reste; Soft-Delete räumt auf | Historie in Enrollments; Exit blockiert nicht |

Reader: **Draft** Occupancy/Kurskarte = Planungsliste (`participants[]`), auch wenn geschlossene Enrollment-Historie existiert (#393). **Active:** Enrollments/`stemOn`; Cache nur Fallback ohne Segmente.

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
- Speichern (nur Draft/Active) sendet `participants[]` (**Dabei** an R = `stemOn(R)`, Werte = `participantId`) und `enrollmentChanges[]` (`participantId`, `add`/`remove`, `dateIso`; Legacy `userId` wird vom Backend akzeptiert). **Kommt** zählen nicht in `participants[]` (#332 Kapazität), sondern nur über `enrollmentChanges`. Inactive: kein Speichern; `updateCourse` lehnt Mitglieder-Patches ab.
- Remove mit letztem Termin (`validUntil < R`) nimmt die Person aus dem nächsten Termin (Ehemalige)
- „endet“ = noch Stamm an R, aber `validUntil` gesetzt (letzter Termin = R oder später)
- **Vergangenes Ende** (`validUntil < R`) ist in der unteren Liste nur Anzeige, nicht editierbar. Wiederaufnahme: neues **ab** nach dem letzten `validUntil` (neues Segment).

## Migration / Seed

`migrateParticipantsToEnrollments` in `shared/courseEnrollment.ts`:

- Pro Eintrag in `participants[]` ein offenes Segment (`participantId` = Eintrag; vor Backfill oft noch Nickname)
- `validFrom` = `seriesStartDate` bzw. `visibleFrom`, sonst Sentinel `ENROLLMENT_OPEN_START` (`0001-01-01` = „schon immer“)
- `source`: `migration` | `seed` | …

Seed schreibt Enrollments aus denselben Kursdaten mit.

### Backfill Active-Kurse (#385)

Aktive Kurse, die nie über `updateCourse`-Bootstrap liefen, können Personen nur in `participants[]`
haben. Heal-Skript (idempotent):

- Shared: `planMissingOpenEnrollmentsFromParticipants` — legt ein offenes Segment nur an, wenn die
  Person in `participants[]` **noch gar keine** Enrollment-Zeile für den Kurs hat (`source: backfill`).
  Geschlossene Historie (auch bei Drift im Cache) wird **nicht** wieder geöffnet.
- Dry-Run-Log: `added` = würde neue Zeile schreiben; `skipped` = bereits Segmente vorhanden.
- Ops (`backend`): zuerst Dry-Run, dann Live — ideal Demo vor Staging/Prod:

```bash
DRY_RUN=1 npm run backfill:active-course-enrollments
# optional: TENANT_ID=… npm run …
npm run backfill:active-course-enrollments
```

Env: `COURSES_TABLE`, `COURSE_ENROLLMENTS_TABLE`, `AWS_REGION`. Draft-Planungsliste bleibt unberührt (#381/#382).

### Backfill `participantId` (#317 hybrid)

Neue Mitglieder erhalten beim Anlegen (`createParticipants`) eine UUID in `participants-table` (`participantId`, GSI `GSI_ParticipantId`). Operative Kurs-/Swap-/Enrollment-Refs bleiben **Nicknames**.

Bestehende Profile: `backend` → `npm run backfill:participant-ids` (zuerst `DRY_RUN=1`). Default:

1. vergibt fehlende `participantId` in Profil/Membership,
2. **ändert keine** Kurs-/Swap-/Override-/Enrollment-Refs.

Ops mit UUIDs bereinigen: `npm run backfill:operational-nicknames`.  
Veraltet und nicht für Demo/Prod: `REWRITE_OPERATIONAL_TO_UUID=1` schreibt Nicknames→UUID in Ops (widerspricht Hybrid).

Auth/Login bleibt beim Nickname (`userId` im JWT); Anzeige mappt über Roster/`getParticipants`.

## Studio-Exit (#383)

`collectStudioExitBlockers` blockiert Studio-Austritt nur über **CourseEnrollments** (offen bzw. `validUntil ≥ heute`) in active/draft, plus Zukunft-Swaps/Waitlist — **nicht** über alleinigen Eintrag in `course.participants[]` / Planungsliste. Soft-Delete entfernt den Cache-Eintrag trotzdem. Details: `docs/multi-tenancy.md`.

## Occupancy (#303)

```text
stemOn(T) = Segmente mit validFrom ≤ T ∧ (kein validUntil ∨ T ≤ validUntil)
effective = stemOn(T) ⊕ Override-Deltas (#291)
```

Ohne Segmente für den Kurs → Fallback `course.participants`.

## Lifecycle-Mails (#380)

Aktivierungs- und geplantes-Kursende-Mails in `updateCourse` wählen Empfänger über
`resolveLifecycleMailRecipientIds` (= `stemOn(referenceDate)` aus CourseEnrollments).
Abgemeldete mit `validUntil` vor dem Referenztermin (R bzw. plannedEndDate) erhalten
keine Mail — auch wenn sie noch im Drift-Cache `course.participants[]` stehen.
Ohne Segmente: Fallback auf die Planungsliste/Cache bis Backfill (#385).

## Zugehörigkeits-Mails (#310)

Nach Speichern im Mitglieder-Dialog (`enrollmentChanges` auf `active` Kursen) klassifiziert
`classifyMembershipMailEvents` den Endzustand pro Person (Beitritt / ab verschieben /
Kommt entfällt / Austritt setzen·verschieben·aufheben). Details: `docs/email-notifications.md`.
Keine Trainer-Mail in diesem Ticket.

## Shared API

- `buildCourseEnrollmentSortKey` / `parseCourseEnrollmentSortKey`
- `stemOnDate` / `isEnrollmentActiveOnDate` / `resolveStemForDate` / `resolveEffectiveTermOccupancy` / `resolveLifecycleMailRecipientIds`
- `deriveActiveParticipantsCacheFromStem` / `isActorOnCourseStem` / `hasPlannedEnrollmentStem` / `stemReferenceDateIso` (#384)
- `migrateParticipantsToEnrollments` / `planMissingOpenEnrollmentsFromParticipants` / `planInactiveToDraftEnrollmentTransition` / `planDraftToActivePlanungslisteMaterialization` / `openEnrollmentUserIds` (Rückgabe: `participantId`-Liste)
- `planStemEnrollmentWrites` / `buildOpenEnrollment` / `closeEnrollmentSegment` / `findOpenEnrollmentForParticipant` / `enrollmentRangesOverlap`
- `classifyMembersForDialog` / `formatMembersDialogHeadline` / `enrollmentChangesToDateMaps` / `classifyMembershipMailEvents` (#310)

Backend: `courseEnrollmentDynamo.ts` (Put/Get/Query-Mapping).

## Nächste Schritte

- Optional: Feld `participants[]` deprecaten/umbenennen (nicht Teil von #384)
