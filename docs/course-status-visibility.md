# Kursstatus, Sichtbarkeit und Auto-Transition (#149, #204)

Dokumentation zum Verhalten ab Issue [#149](https://github.com/CurlyKarin/yogaswap/issues/149), [#204](https://github.com/CurlyKarin/yogaswap/issues/204) und [#296](https://github.com/CurlyKarin/yogaswap/issues/296): welche Kurse Teilnehmende sehen, wann ein Kurs automatisch `inactive` wird, und wie Nachlauf vs. Block-Endedatum zusammenhängen.

## Kurzfassung

| Thema | Verhalten |
|--------|-----------|
| **`draft`** | Teilnehmer:innen sehen den Kurs nicht. |
| **`active`** | Normale Sichtbarkeit; Termine über `getCourseDates` (Datum + Uhrzeit ≥ jetzt). |
| **`active` → `inactive`** | Automatisch, wenn ein **Blockende** definiert ist und der UTC-Kalendertag **nach** der Zugriffsfrist liegt (siehe unten). Nicht mehr allein bei „kein Zukunftstermin“. |
| **Nachlauf** | Nur **durchlaufende Kurse**: Teilnehmende sehen den Kurs nach dem letzten Termin noch bis zur Auto-Inaktiv-Schwelle (Default **7** Kalendertage nach letztem Termin bzw. `plannedEndDate`, UTC). **Kursblöcke:** kein Studio-Nachlauf — Frist = inklusives `seriesEndDate` (#296). |
| **Lazy Reconcile** | Beim **`GET /courses`** werden Status und abgeleitete `dates` bei Bedarf in DynamoDB nachgezogen. |

Studio-Konfiguration: **Admin → Studio-Einstellungen** ([#44](https://github.com/CurlyKarin/yogaswap/issues/44), [#312](https://github.com/CurlyKarin/yogaswap/issues/312)) — **Allgemein** (u. a. Kurzfrist-Absage); unter **Durchlaufende Kurse**: `inactiveGraceDaysAfterCourseEnd`, `minOffsetDays` / `maxOffsetDays`, `rollingPlanningHorizonWeeks` (nicht für Kursblöcke). Rollkurse: [rolling-courses-planning.md](./rolling-courses-planning.md).

---

## Sichtbarkeit nach Rolle

```mermaid
flowchart LR
  subgraph participant [Teilnehmer:in]
    P1{status?}
    P1 -->|draft| PH[nicht sichtbar]
    P1 -->|active| PA[sichtbar mit Zukunftsterminen]
    P1 -->|active, letzter Termin vorbei| PW{noch in Zugriffsfrist?}
    PW -->|ja| PG[Kachel sichtbar, Wind-down]
    PW -->|nein| PH
    P1 -->|inactive| PI{noch in Zugriffsfrist?}
    PI -->|ja| PG
    PI -->|nein| PH
  end

  subgraph admin [Admin / Instructor Verwaltung]
    A1[Status filtert nicht]
    A2[immer in Kursliste wenn Berechtigung]
  end
```

**Quelle:** `shared/src/permissions.ts` — `canSeeCourse`, `canShowParticipantCourseCard`.

Teilnehmer-Kachel auch **ohne Zukunftstermine**, wenn:

- `inactive` und noch innerhalb der Zugriffsfrist, oder
- `active`, letzter Termin vorbei, aber noch in der Zugriffsfrist (`isWithinPostCourseEndGrace` — bis Reconcile oder bei laufendem Block).

---

## Zugriffsfrist und Auto-Inaktiv (#204)

Gemeinsame Schwelle für **Auto-Inaktiv** und **Teilnehmer-Sichtbarkeit/Wind-down**:

**Kursblock** (`bounded_series`, #296):

```
ZugriffsfristEnde = seriesEndDate   (inklusiv; Fallback visibleUntil)
```

Letzter Unterrichtstag darf **davor** liegen. Studio-Nachlauf und Tauschfenster (`minOffsetDays` / `maxOffsetDays`) gelten nicht. Tausch über die Blocklaufzeit bis zum Endedatum; danach keine neuen Täusche. Offene Swaps werden nicht extra gelöscht (wie beim Setzen von `plannedEndDate` am Rollkurs).

Am **aktiven** Kursblock kann das Studio Start- und Endedatum noch korrigieren: Ende nicht vor dem letzten Termin; Start nur, wenn der erste Termin noch in der Zukunft liegt (frühestens heute).

**Rollkurs** mit `plannedEndDate`:

```
ZugriffsfristEnde = max( plannedEndDate, letzterTerminIso + inactiveGraceDaysAfterCourseEnd )
```

| Symbol | Bedeutung |
|--------|-----------|
| `blockEndIso` | `courseBlockEndIso()` — `seriesEndDate` / `visibleUntil` (Kursblock) oder `plannedEndDate` (Rollkurs mit Ende) |
| `letzterTerminIso` | `lastScheduledOccurrenceIso()` — nur aus `dates`, kein seriesEndDate-Fallback |
| `inactiveGraceDaysAfterCourseEnd` | Studio-Einstellung (Default **7**, UTC-Kalendertage), **nur Rollkurse** |

**Im Code:** `effectiveAutoInactiveDeadlineIso` und `participantCourseAccessDeadlineIso` in `shared/src/courseStatus.ts`.

### Nach Planungsmodus

| Modus | Blockende | Auto-inaktiv |
|-------|-----------|--------------|
| **bounded_series** | `seriesEndDate` (ggf. `visibleUntil`) | Ja, am Tag **nach** dem inklusiven Endedatum — ohne Nachlauf |
| `rolling_continuous` **mit** `plannedEndDate` | `plannedEndDate` | Ja, nach `plannedEnd` bzw. letzter Termin + Nachlauf |
| `rolling_continuous` **ohne** `plannedEndDate` | — | **Kein** Auto-inaktiv |

**Bedeutung:**

- Block läuft noch (`heute ≤ seriesEndDate`) → Kurs bleibt `active`, auch ohne zukünftige Termine (Lücke bis Saisonende: Tausch von vergangenen Terminen).
- Termine nach dem Endedatum zählen nicht; die Frist verlängert sich nicht.
- Liegt kein Termin in `dates`, gilt nur `blockEndIso` als Frist.

---

## Automatischer Übergang `active` → `inactive`

```mermaid
flowchart TD
  A[status: active] --> B{blockEndIso definiert?}
  B -->|nein| Z[status unverändert]
  B -->|ja| C{UTC-Heute > ZugriffsfristEnde?}
  C -->|nein| Z
  C -->|ja| E[effectiveStatus: inactive]
  E --> F[Persistieren bei Reconcile/Speichern]
```

**Auslöser (gleiche Regel):**

| Pfad | Lambda / Handler |
|------|------------------|
| Kursliste laden | `get-courses` → `GET /courses` |
| Kurs speichern | `update-course` → `PUT /courses/{id}` |
| Kurs anlegen | `create-course` → `POST /courses` |

Implementierung: `shouldAutoDeactivateCourse` in `shared/src/courseStatus.ts`, aufgerufen aus `backend/src/lambdas/shared/courseReconcile.ts`.

Manuelles `active` → `inactive` bleibt an bestehende Guards gebunden — nur in `updateCourse`, nicht beim Lazy Reconcile.

---

## Lazy Reconcile in `getCourses`

```mermaid
sequenceDiagram
  participant App
  participant API as API GET /courses
  participant Lambda as get-courses
  participant DDB as DynamoDB courses

  App->>API: Kursliste laden
  API->>Lambda: invoke
  Lambda->>DDB: Query tenantId
  loop pro Kurs
    Lambda->>Lambda: deriveVisibleDates
    Lambda->>Lambda: computeCourseReconcile
    alt status oder dates geändert
      Lambda->>DDB: PutItem
    end
  end
  Lambda-->>App: JSON mit effectiveStatus + dates
```

Deploy ändert bestehende Kurse erst beim **nächsten** erfolgreichen `GET /courses` nach Ausrollen.

---

## Nachlauf, Wind-down und Tauschfenster

### Kurs-Wind-down (`isParticipantCourseWindDown`)

Teilnehmer-Kachel im **Wind-down** (CSS `course-card--inactive-participant`, `participantActionsLocked`):

- Keine vollen Terminaktionen am **aktuellen/künftigen** Termin (keine Absage, kein neuer Tausch).
- **RC-Nachlauf** am **vergangenen** Termin bleibt möglich: „Anderen Termin wählen“, offene Anfragen verwalten, weitere Tauschanfragen (#204 Option A).

### Termin-Nachlauf (pro Vergangenheitstermin)

Unabhängig vom Kurs-Wind-down, RC-Tausch vom vergangenen Termin (`isTermInParticipantSwapGrace`):

| Modus | Fenster |
|-------|---------|
| **Durchlaufend** | **7 Tage** (Studio-Einstellung `inactiveGraceDaysAfterCourseEnd`) nach dem jeweiligen Termin |
| **Kursblock** | alle vergangenen Termine, solange `heute ≤ seriesEndDate` — kein Studio-Nachlauf |

Tauschziele: Rollkurse im Studio-Offset (`minOffsetDays` / `maxOffsetDays`); Kursblöcke beliebige Zukunftstermine bis zum inklusiven Endedatum des **Zielkurses**. Nach dem Endedatum des **Ursprungsblocks** keine neuen Täusche. Offene pending/active Swaps werden nicht gelöscht (vgl. Rollkurs-`plannedEndDate`, später [#174](https://github.com/CurlyKarin/yogaswap/issues/174)). Details: [course-views.md](./course-views.md).

| Einstellung | Default | Gilt für |
|-------------|---------|----------|
| `inactiveGraceDaysAfterCourseEnd` | **7** | nur durchlaufende Kurse |
| `minOffsetDays` / `maxOffsetDays` (Tauschfenster) | **-7 / +7** | nur durchlaufende Kurse |
| `rollingPlanningHorizonWeeks` | **5** | nur durchlaufende Kurse |

In der UI stehen diese Felder unter **Durchlaufende Kurse** ([#312](https://github.com/CurlyKarin/yogaswap/issues/312)); Kurzfrist-Absage bleibt bei **Allgemein**.

**Quellen:** `shared/src/courseStatus.ts`, `app/src/lib/courseTermActions.ts`, `app/src/lib/courseCardLabels.ts`, `app/src/components/CourseCard.tsx`.

---

## Admin-Hinweise in der UI

| Anzeige | Bedeutung |
|---------|-----------|
| **wird beim Speichern inaktiv** | DB noch `active`, aber UTC-Heute liegt nach `participantCourseAccessDeadlineIso` (`wouldAutoDeactivateOnReconcile`) |
| **automatisch inaktiv** | `inactive`, Blockende definiert, keine sichtbaren Zukunftstermine (`looksLikeAutomaticallyInactive`) |

---

## Relevante Dateien

| Bereich | Datei |
|---------|--------|
| Permissions | `shared/src/permissions.ts` |
| Frist / Nachlauf / Occurrences | `shared/src/courseStatus.ts` |
| Reconcile | `backend/src/lambdas/shared/courseReconcile.ts` |
| Wind-down / RC-Nachlauf UI | `app/src/lib/courseTermActions.ts`, `app/src/components/useCourseCardTermState.ts` |
| Hinweistexte | `app/src/lib/courseCardLabels.ts` |
| Kurskarte | `app/src/components/CourseCard.tsx`, `CourseTermActions.tsx` |

---

## Siehe auch

- [#149](https://github.com/CurlyKarin/yogaswap/issues/149) — Umsetzung Sichtbarkeit + Auto-Transition
- [#44](https://github.com/CurlyKarin/yogaswap/issues/44) — Studio-Settings (Nachlauf, Tauschfenster, Planungssperre)
- [#129](https://github.com/CurlyKarin/yogaswap/issues/129) — Lifecycle-Guardrails (`updateCourse` / Prune)
- [#165](https://github.com/CurlyKarin/yogaswap/issues/165) — Rollende Kurse mit optionalem Ende
- [#296](https://github.com/CurlyKarin/yogaswap/issues/296) — Kursblock: Tausch und Rechte bis Endedatum
- [#312](https://github.com/CurlyKarin/yogaswap/issues/312) — Studio-Einstellungen nur für durchlaufende Kurse
