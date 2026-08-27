# Kursübersicht und Wochenansicht (Issue #164)

Produkt- und UI-Abstimmung für zwei getrennte Ansichten der Kurse/Termine. Ergänzt [#164](https://github.com/CurlyKarin/yogaswap/issues/164); Sichtbarkeit nach Kursstatus bleibt in [#149](https://github.com/CurlyKarin/yogaswap/issues/149) (`docs/course-status-visibility.md`).

## Kurzfassung

| Ansicht | Primär für | Job |
|--------|------------|-----|
| **Kursübersicht** | Admin, Kursleitung | Planen & verwalten (Status, Kapazität, Mitglieder, Termine, Überplanung) |
| **Wochenansicht** | Teilnehmer:innen, Kursleitung im Alltag | Orientierung in der Zeit; Absagen/Ausschlüsse erkennbar; Tausch-Kontext |

Beide Ansichten sind umgesetzt. `CoursesShell` schaltet zwischen ihnen; die Wochenansicht nutzt ein gemeinsames **`weekAnchor`** und Kurskacheln (`CourseWeekView` + `CourseCard`).

---

## Architektur (App)

```text
CoursesShell
  viewMode: 'week' | 'courses'     (Default: week)
  weekAnchor: Date                 (Montag 00:00, Lokalzeit)

  week  → CourseWeekView → CourseCard (pro sichtbarem Kurs)
  courses → CourseList → CourseCard   (nur canSeeCourseManagement)
```

Daten: `useCoursesData` (Kurse, Overrides, Swaps, `weekCourseRows`, `earliestWeekAnchor`, `hiddenPastCourseCount`).

Vertretung (`forceParticipantView` in `App`): Teilnehmer-Perspektive in der **Wochenansicht**; Kursübersicht bleibt für Admin/Kursleitung reserviert.

---

## Kursübersicht

**Mental Model:** Nach **Kurs** sortiert; pro Kurs die **anstehenden, planungsseitig sichtbaren** Termine (`visibleDates` / `getCourseDates`: Datum + Uhrzeit ≥ jetzt); pro gewähltem Termin der **effektive** Zustand (Serie + Override).

**Nicht:** vollständiger Kalender, keine Terminhistorie; **ausgeschlossene** Serientage (`excludedDates`) erscheinen nicht in der Datumsauswahl (nicht in `visibleDates`).

**Rollen:** Nur mit `canSeeCourseManagement` (Admin/Kursleitung). Toolbar „Kurse verwalten“.

**Code:** `app/src/components/CourseList.tsx`, `CourseCard.tsx` (ohne `includePastTermsInSelect`).

---

## Wochenansicht

**Mental Model:** Eine **Kalenderwoche** (`weekAnchor`); alle sichtbaren Kurse als Kacheln im Grid. Pro Kurs Termine dieser Woche (und Nachlauf-Sprünge) über die Terminauswahl in der Kachel.

### Gemeinsame Kalenderwoche

- Alle Kacheln beziehen sich auf dieselbe KW (`weekAnchor`).
- Terminwahl in einer Kachel **außerhalb** der aktuellen KW → `weekAnchor` wechselt (`onDateChange` / `weekAnchorForOccurrence`).
- Terminwahl **innerhalb** der KW → nur Fokus in der Kachel, `weekAnchor` unverändert.

**Vorauswahl:** `preferredWeekCardDate` — bevorzugt geplante, künftige Termine in der KW; **überspringt** `excludedDates`; in vergangener KW der letzte Termin dort.

**Terminliste in der Kachel:** `getWeekViewCardDates` — künftige Termine plus alle Termine der angezeigten KW (inkl. Vergangenheit in der KW und Nachlauf-Termine außerhalb der KW zum Springen).

### Sondertermine in der Kachel

| Zustand | Erkennbar wie | Aktionen (Teilnehmer) |
|--------|----------------|------------------------|
| **Studio-Entfall** (`excludedDates`) | Marker `CalendarX` (rot), Dropdown `(entfällt)`, Hinweis „Termin entfällt“ | Keine Absage/Tausch; Swap ggf. nur abbrechen |
| **Vergangen** (Nachlauf) | Marker `History` | Kurs-Wind-down: keine Absage am laufenden Termin; RC-Absage → „Anderen Termin wählen“ / offene Anfragen; Swaps abbrechen |
| **Cutoff** (kurz vor Start) | Marker `Clock3` | Kein neuer Tausch; SN/RC-Regeln (#167) |
| **Eigene RC/SN** | Chips (eigenes Chip grün; SN: du kräftig rot, andere blass) | Absage/Tausch wie in Kursübersicht |
| **Aktiver Tausch vom Ursprung** | Oft nicht in Teilnehmer-Chips; Status-Text unten („Getauscht mit …“) | Follow-up [#185](https://github.com/CurlyKarin/yogaswap/issues/185) |

Daten: `collectWeekOccurrences` / `isExcludedCourseDate` in `app/src/lib/courseWeekOccurrences.ts`; Filter Nachlauf in `useCoursesData` / `canShowCourseInPastWeek`.

### Teilnehmer-Chips (Kurskachel)

Die Chip-Zeile zeigt die **effektive Terminbelegung**, nicht die Stamm-Mitgliedschaft (die liegt im Mitglieder-Dialog).

| Kontext | Anzeige |
|---------|---------|
| Gewählter Termin (Zukunft oder Wochenansicht) | Override: eingetragen, getauscht, SN, Warteliste, Gäste |
| Kursübersicht im **Nachlauf** (letzter Termin) | Override dieses Termins — wie in der Wochenansicht |
| **Nach abgelaufener Zugriffsfrist** | Stammteilnehmer (`course.participants`); Termin-Dropdown „—“ |

Code: `useCourseCardTermState` (`useTermScopedParticipantState`).

Aggregierter Hinweis, wenn Kurse in der KW wegen abgelaufenem Nachlauf ausgeblendet werden: `hiddenPastCourseCount`.

### Tausch-UI

- Zieltermine: `getAvailableDates` / `getWaitlistDates` (weiterhin keine Ziele in der Vergangenheit; Swap-Fenster `SwapSettings`).
- Modal mit Hilfe-Texten zu freien Terminen und Warteliste.
- Bekannte Bugs: [#184](https://github.com/CurlyKarin/yogaswap/issues/184) (SN-Persistenz im Cutoff, behoben in #190).

**Code:** `app/src/components/CourseWeekView.tsx`, `CourseCard.tsx` (`includePastTermsInSelect`), `app/src/lib/courseTermActions.ts`.

---

## Navigation (UI)

```text
[ Wochenansicht | Kursübersicht ]     ← nur Admin/Kursleitung

[ ‹ ]  KW …  [ › ]  [ Heute ]  [Person]   ← nur Wochenansicht; Person = „nur meine Kurse“
```

- Die Kurs-Toolbar (`#course-toolbar` / `.course-views-toolbar`) ist **sticky unter dem App-Header** (#287) — auf Mobile und Desktop, damit KW-Wechsel, „Heute“ und Ansichts-Umschalter beim Scrollen durch viele Kacheln erreichbar bleiben.
- Default **Wochenansicht** für alle Rollen mit Kurszugang.
- Hinweis unter der Toolbar in der Wochenansicht (Absagen/Tauschen).
- **„Nur meine Kurse“** (#258): Person-Icon in der Wochen-Navigation.
  - **Teilnehmende:** standardmäßig an (nur Kurse mit eigener Beteiligung: Stammplatz, Swap oder Instructor-Zuordnung).
  - **Admin/Kursleitung mit Kurszuordnung:** standardmäßig an, umschaltbar.
  - **Admin/Kursleitung ohne Zuordnung:** Button deaktiviert, immer alle Kurse.
  - Zustand wird **nicht** in `sessionStorage` gemerkt (Rollen-Default bei jedem Laden) — bewusst einfach für Teilnehmende.
- **„Heute“** (#259): **ein Klick** setzt die aktuelle KW und fokussiert den relevanten Kurs unter den **sichtbaren** Kacheln (Filter unverändert).
  - Vorrang: **laufender** Termin (`start ≤ jetzt < start + 90 Min`, ICS-Default bis #239).
  - Sonst: nächster Termin in der KW (chronologisch); Beteiligung nur als Tiebreaker.
  - Typischer Fall Admin/Kursleitung mit allen Kursen: Sprung zum gerade laufenden Studio-Kurs.
  - Teilnehmende mit „alle Kurse“ (Überblick): ebenfalls zum laufenden Studio-Kurs; mit „nur meine“ nur innerhalb der eigenen Kacheln.
- KW-Persistenz in der Tab-Session: [#187](https://github.com/CurlyKarin/yogaswap/issues/187).

### Vergangenheit (Nachlauf)

| Regel | Verhalten |
|--------|-----------|
| **Sichtbarkeit** | Vergangene KW: nur Kurse im Kalender-Nachlauf (Rollkurs) bzw. bis inklusivem Block-Endedatum mit Termin in dieser KW. |
| **Navigation ‹** | `computeEarliestWeekAnchor`; ‹ deaktiviert am unteren Limit. |
| **Vergangener Termin** | Keine Absage am laufenden Termin; kein Tausch ohne RC-Absage. |
| **RC abgesagt** | „Anderen Termin wählen“, weitere Tauschanfragen, offene Anfragen abbrechen — auch im Kurs-Wind-down. |
| **Bestehende Swaps** | Abbrechen/verwalten weiter möglich. |

---

## Abgrenzung

| Thema | Issue / Doku |
|--------|----------------|
| Kursstatus, `visibleDates`, Nachlauf, Wind-down, Block-Endedatum | #149, #204, #296, `course-status-visibility.md` |
| Kalender-/Swap-Zeitachse, Sondertermine | #164 (dieses Dokument) |
| Kontrollierte Überplanung | #153, `course-overbooking.md` |
| Kurzfristige Absage (SN/RC, Cutoff) | #167, `short-notice-cancellation.md` |

---

## Umsetzungsstand

### Erledigt (Branch `feature/164-week-view`)

- [x] `CoursesShell`: `viewMode`, `weekAnchor`, Toggle, Wochennavigation
- [x] `CourseWeekView` mit Kurskarten-Grid
- [x] `CourseList` als Kursübersicht (nur Verwaltung)
- [x] Nachlauf, früheste KW, ausgeblendete Kurse-Hinweis
- [x] Termin-Dropdown inkl. KW, Vergangenheit, Nachlauf-Sprung
- [x] Studio-Entfall (`excludedDates`) sichtbar + Marker
- [x] Termin-Marker Nachlauf / Cutoff / entfällt (ohne Text-Legende)
- [x] Swap-Modal mit Kontext-Hilfen
- [x] Chip-Hervorhebung: eigener Teilnehmer/Warteliste; SN/Tausch-Farben
- [x] Tests (`CoursesShell`, `CourseWeekView`, `courseWeekOccurrences`, `CourseCard`, …)

### Offen / Follow-up

- [ ] [#164](https://github.com/CurlyKarin/yogaswap/issues/164) schließen nach QA + Merge
- [ ] Bug [#183](https://github.com/CurlyKarin/yogaswap/issues/183) (Tausch nur reguläre Zielkapazität)
- [ ] Layout-Polish Kacheln [#182](https://github.com/CurlyKarin/yogaswap/issues/182)
- [ ] Meilenstein Post-rollout: Kachel Status/Tausch-Ursprung [#185](https://github.com/CurlyKarin/yogaswap/issues/185)
- [ ] Meilenstein Post-rollout: Übersicht „Meine Termine“ [#186](https://github.com/CurlyKarin/yogaswap/issues/186) (`groupWeekRowsByDay` vorbereitet, UI noch nicht)
- [ ] KW in Tab-Session behalten + Vertretung ([#187](https://github.com/CurlyKarin/yogaswap/issues/187))
- [ ] Optional: URL-Parameter, Tagesgruppierung in der Wochenansicht

---

## Verknüpfung

- [#164](https://github.com/CurlyKarin/yogaswap/issues/164) — Wochenansicht
- [#149](https://github.com/CurlyKarin/yogaswap/issues/149) — Kursstatus-Sichtbarkeit
- [#182](https://github.com/CurlyKarin/yogaswap/issues/182) — Layout Kurskacheln
- [#185](https://github.com/CurlyKarin/yogaswap/issues/185) — Tausch-Ursprung / eigene Absagen in der Kachel
- [#186](https://github.com/CurlyKarin/yogaswap/issues/186) — Terminübersicht nach Woche
- [#187](https://github.com/CurlyKarin/yogaswap/issues/187) — `weekAnchor` in Session, Vertretung in gleicher KW
- [#287](https://github.com/CurlyKarin/yogaswap/issues/287) — Sticky Kurs-/Wochennavigation unter dem Header
