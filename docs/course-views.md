# Kursübersicht und Wochenansicht (Issue #164)

Produkt- und UI-Abstimmung für zwei getrennte Ansichten der Kurse/Termine. Ergänzt [#164](https://github.com/CurlyKarin/yogaswap/issues/164); Sichtbarkeit nach Kursstatus bleibt in [#149](https://github.com/CurlyKarin/yogaswap/issues/149) (`docs/course-status-visibility.md`).

## Kurzfassung

| Ansicht | Primär für | Job |
|--------|------------|-----|
| **Kursübersicht** | Admin, Kursleitung | Planen & verwalten (Status, Kapazität, Mitglieder, Termine, Überplanung) |
| **Wochenansicht** | Teilnehmer:innen, Kursleitung im Alltag | Orientierung in der Zeit; Absagen/Ausschlüsse erkennbar; Tausch-Kontext |

Heute existiert nur die **kurszentrierte Kurskarten-Liste** (`CourseList` + `CourseCard`) — für alle Rollen. #164 führt die **Wochenansicht** ein und benennt die bestehende Liste als **Kursübersicht** (Planungsfokus).

---

## Kursübersicht (Ist → Ziel)

**Mental Model:** Nach **Kurs** sortiert; pro Kurs die **anstehenden, planungsseitig sichtbaren** Termine (`visibleDates` / `getCourseDates`: Datum + Uhrzeit ≥ jetzt); pro gewähltem Termin der **effektive** Zustand (Serie + Override).

**Nicht:** vollständiger Kalender, keine Terminhistorie, ausgeschlossene Tage erscheinen nicht in der Datumsauswahl (sie sind aus `visibleDates`).

**Ziel-Rollen:** Admin und Kursleitung (Verwaltung). Teilnehmer:innen nutzen künftig primär die **Wochenansicht**. Vertretung (`forceParticipantView`) gehört zur Wochenansicht, nicht zur Kursübersicht.

**Code (aktuell):** `app/src/components/CourseList.tsx`, `CourseCard.tsx`, Toolbar „Kurse verwalten“.

---

## Wochenansicht (#164)

**Mental Model:** Nach **Kalenderwoche** sortiert; mehrere Kurse im gleichen Zeitfenster; Sonderzustände pro Termin sichtbar.

### Anforderungen (aus #164 / #149)

- **Abgesagte** und **ausgeschlossene** Termine in irgendeiner Form sichtbar (eigene Darstellung), nicht nur über reduzierte `visibleDates`.
- **Swap-Tausch-UI:** begrenzt in die **Vergangenheit** blicken (Referenz/Ursprung); **Zieltermine in der Vergangenheit** weiterhin fachlich nicht erlaubt (bestehende Regeln, `SwapSettings`).
- Datenquellen: `excludedDates`, Overrides, Swaps, ggf. Abwesenheiten — konsistent mit #149 und `TenantSettings`.

### Gemeinsame Kalenderwoche

Eine zentrale **`weekAnchor`** (Start der angezeigten Woche, z. B. Montag 00:00 in Studio-/Lokalzeit):

- Alle Kurse in der Wochenansicht zeigen Termine **dieser Woche**.
- Wählt jemand an einem Kurs ein Datum außerhalb der aktuellen Woche → **`weekAnchor` wechselt** → alle anderen Kurse „springen“ in dieselbe Woche.
- Klick innerhalb der aktuellen Woche → nur Fokus/Highlight wechseln, `weekAnchor` unverändert.

Vorgeschlagener App-State (eine Ebene über den Kurskomponenten, z. B. `CoursesShell`):

```text
viewMode: 'week' | 'courses'
weekAnchor: Date
selectedOccurrence?: { courseId, dateIso }
```

---

## Navigation (UI)

Gemeinsame Leiste über dem Kursbereich (`App` oder `CoursesShell`):

```text
[ Wochenansicht | Kursübersicht ]     ← Kursübersicht nur bei Berechtigung (Admin/Kursleitung)

[ ‹ ]  KW 22 · 26. Mai – 1. Juni 2026  [ › ]  [ Heute ]   ← nur in Wochenansicht
```

- **Ansichts-Toggle:** Segmented Control oder zwei Buttons (`aria-pressed` / aktive Klasse).
- **Wochensteuerung:** nur in der Wochenansicht sichtbar.
- Optional später: URL-Parameter (`?view=week&week=2026-W22`) für Reload/Bookmark — nicht zwingend in v1.

### Defaults & Wechsel

| Situation | Vorschlag |
|-----------|-----------|
| Teilnehmer:in | Default **Wochenansicht** |
| Admin / Kursleitung | Default **Wochenansicht**; Umschalter zur **Kursübersicht** |
| Woche → Kursübersicht | `weekAnchor` merken |
| Kursübersicht → Woche | Woche von „heute“ oder letztem `weekAnchor` |
| Letzte Ansicht | optional `localStorage` |

Hinweis-Text unter dem Header („Termin absagen“ / „Tauschen“) ggf. nur in der Wochenansicht oder ansichtsspezifisch.

---

## Abgrenzung

| Thema | Issue / Doku |
|--------|----------------|
| Kursstatus, `visibleDates`, Nachlauf | #149, `course-status-visibility.md` |
| Kalender-/Swap-Zeitachse, Sondertermine | #164 (dieses Dokument) |
| Kontrollierte Überplanung | #153, `course-overbooking.md` |

---

## Umsetzung (technisch, grob)

1. `CoursesShell`: State `viewMode`, `weekAnchor`, Toggle + Wochennav.
2. `CourseList` → Kursübersicht (Benennung, ggf. nur mit `canSeeCourseManagement`).
3. Neue `WeekView` (oder ähnlich): Termine pro Woche, inkl. abgesagt/ausgeschlossen.
4. Swap-Modals: geteilte Woche / begrenzte Vergangenheit (#164).
5. Tests + Accessibility (Toggle, Wochenbuttons).

---

## Verknüpfung

- [#164](https://github.com/CurlyKarin/yogaswap/issues/164) — Wochenansicht (Termine, Absagen, Ausschlüsse, Swap-Kontext)
- [#149](https://github.com/CurlyKarin/yogaswap/issues/149) — Kursstatus-Sichtbarkeit
