# QA-Checkliste: Barrierefreiheit Hauptansicht

Kurzer, wiederholbarer manueller Test für die **Hauptansicht nach Login** — Tastatur und Screenreader, ohne Voll-Audit.

- **Parent:** [#171 — Barrierefreiheit: Hauptansicht](https://github.com/CurlyKarin/yogaswap/issues/171)
- **Ticket:** [#198](https://github.com/CurlyKarin/yogaswap/issues/198)
- **Stand:** nach #171.1–#171.6 (App-Shell, Wochennavigation, Kurskarten-Semantik, Terminaktionen, Swap-Modal, Chips/Badges)

---

## Abgrenzung zu [#113](https://github.com/CurlyKarin/yogaswap/issues/113)

| Thema | Hier (#198 / #171) | Dort (#113) |
|--------|-------------------|-------------|
| Landmarks, Skip-Links, Tab-Reihenfolge | ✓ | — |
| Kurskarte: Termin wählen, Buttons benennen | ✓ | — |
| Dialoge der Hauptansicht (Tausch-Modal) | ✓ | Querprüfung möglich |
| **Globale Konvention** für `aria-live` / `role="alert"` | nur stichprobenartig | ✓ Schwerpunkt |
| Login, Invite, Passwort-Reset, alle Admin-Formulare | nur Login-Stichprobe | ✓ |
| Vereinheitlichung aller Statusmeldungen in der App | — | ✓ |

Diese Checkliste prüft, ob die **Hauptansicht nutzbar** ist. #113 zielt auf **einheitliche Live-Region-Patterns** über alle Views hinweg.

---

## Voraussetzungen

- [ ] App lokal (`npm run dev` in `app/`) oder Staging/Produktion
- [ ] Testnutzer:in mit Rolle **Teilnehmer** (Kernflow Absage/Tausch)
- [ ] Optional zweiter Account **Admin/Kursleitung** (Kursübersicht, Verwaltungsaktionen)
- [ ] **Nur Tastatur:** Maus/trackpad nicht benutzen
- [ ] **Screenreader (empfohlen):** macOS VoiceOver (`Cmd + F5`), Basis: `Ctrl + Option + Pfeiltasten`

Referenz für Wochen- vs. Kursübersicht: [docs/course-views.md](course-views.md)

---

## A — Nur Tastatur

### A1 Login → Hauptansicht

- [ ] Mit `Tab`/`Shift+Tab` alle Felder und den Anmelde-Button erreichen
- [ ] Fokus ist auf allen interaktiven Elementen **sichtbar**
- [ ] Nach Login landet der Fokus sinnvoll (nicht „im Nirgendwo“)

### A2 Skip-Links und Landmarks

- [ ] Beim ersten `Tab` erscheinen Skip-Links (Menü / Inhalt / Footer)
- [ ] „Zum Inhalt“ springt in den **Hauptbereich** (`main`)
- [ ] `Tab`-Reihenfolge grob: Skip-Links → Kopfzeile/Menü → Kursbereich → ggf. Verwaltung → Footer

### A3 Kopfzeile

- [ ] Logout und ggf. Vertretung per Tastatur erreichbar
- [ ] Beschriftung der Buttons ist eindeutig (nicht nur Icon)

### A4 Wochenansicht (Standard nach Login)

- [ ] Umschalter **Woche / Kurse verwalten** per Tastatur bedienbar
- [ ] Wochennavigation (‹ / › / „Aktuelle Woche“) per Tastatur bedienbar
- [ ] Fokus bleibt nach Wochenwechsel sichtbar und vorhersehbar

### A5 Kurskarte — Kernflow

Auf einer Karte mit mindestens einem zukünftigen Termin und eingetragenem Teilnehmer:

- [ ] `Tab` erreicht die **Terminauswahl** (`select`)
- [ ] `Tab` erreicht **Termin absagen** oder **Tauschen anfragen** (je nach Zustand)
- [ ] `Enter`/`Leertaste` löst die fokussierte Aktion aus
- [ ] Deaktivierte Buttons sind per Tastatur erreichbar, reagieren aber nicht (oder sind klar als deaktiviert erkennbar)

### A6 Tausch-Dialog öffnen und schließen

- [ ] **Tauschen anfragen** öffnet Modal; Initialfokus liegt im Dialog
- [ ] `Tab` bleibt **im Dialog** (Focus Trap)
- [ ] `Escape` schließt den Dialog
- [ ] **Schließen**-Button schließt den Dialog; Fokus kehrt sinnvoll zurück

### A7 Optional: Kursübersicht (Admin/Kursleitung)

- [ ] Ansicht „Kurse verwalten“ erreichbar
- [ ] Admin-Aktionen an einer Karte (Bearbeiten, Termine, …) per Tastatur erreichbar
- [ ] Kein Fokus „stecken bleiben“ außerhalb bewusster Modale

### A8 Optional: Verwaltung (Teilnehmer, Studio-Einstellungen)

- [ ] Verwaltungsbereich unterhalb der Kursliste erreichbar (Landmark „Verwaltung“)
- [ ] **Teilnehmer verwalten**: Suche, Sammelaktionen, Tabellenkopfzeilen per Screenreader erkennbar
- [ ] Icon-Buttons (Einladen, Bearbeiten, Löschen) mit beschreibendem Namen
- [ ] **Studio-Einstellungen** (Admin): Formularfelder mit Label, Speichern per Tastatur

**Ergebnis A:** [ ] bestanden  [ ] mit Anmerkungen (unten)

---

## B — Screenreader (VoiceOver)

Gleicher inhaltlicher Pfad wie A5/A6; zusätzlich auf **Ansagen** achten.

### B1 Seitenstruktur

- [ ] Eine **Überschrift Ebene 1** für die Seite
- [ ] Kurskarten als **`article`** / mit Kursnamen erkennbar („Kurs: …“)
- [ ] Terminplan der Karte verständlich (Wochentag · Uhrzeit)

### B2 Termin und Aktionen

- [ ] Termin-`select` mit Kontext („Termin für [Kursname]“)
- [ ] Aktions-Buttons mit **vollständigem Namen** (Aktion, Kurs, Datum) — nicht nur „Termin absagen“
- [ ] Nach erfolgreicher Absage: **Live-Ansage** (z. B. „Termin abgesagt …“)

### B3 Chips, Status, Marker

- [ ] Teilnehmer-Chips in **„Teilnehmer, Liste“** mit Status (z. B. „regulär eingetragen“, „getauscht“, „du“)
- [ ] Warteliste analog („… auf der Warteliste“)
- [ ] Inaktiver Kurs: Badge **„Kursstatus: …“** und/oder Hinweistext unter der Karte
- [ ] Wochenansicht: Marker (entfällt / Nachlauf / Cutoff) als **beschreibender Text**, nicht stummes Icon

**Bekannte Einschränkung:** Der Kursstatus-Badge kann in VoiceOver **nach** der Uhrzeit in der Elementreihenfolge erscheinen. Der ausführliche Inaktiv-Hinweis (`role="status"`) liefert den Kontext.

### B4 Tausch-Modal

- [ ] Dialog wird als solcher angekündigt (`aria-modal`, beschreibendes Label)
- [ ] Hilfe-Buttons (`?`) lesen Beschreibung vor; Popover öffnet/schließt per Klick

**Ergebnis B:** [ ] bestanden  [ ] mit Anmerkungen (unten)

---

## C — Automatisierte Regression (vor manuellem Test)

```bash
cd app && npm test -- --run \
  src/App.test.tsx \
  src/components/CoursesShell.test.tsx \
  src/components/CourseWeekView.test.tsx \
  src/components/CourseCard.test.tsx \
  src/components/CourseSwapModal.test.tsx \
  src/components/AdminPanel.test.tsx \
  src/components/StudioSettingsSection.test.tsx
```

- [ ] Alle genannten Tests grün

---

## Schnell-Durchlauf (≈ 10 Minuten)

1. Einloggen (nur Tastatur)
2. Skip-Link „Zum Inhalt“
3. Eine Kurskarte: Termin wählen → **Tauschen anfragen** → Dialog mit `Escape` schließen
4. Dieselbe oder andere Karte: **Termin absagen** (wenn möglich) — Live-Ansage hören
5. VoiceOver: ein Teilnehmer-Chip und Warteliste anhören
6. Optional: Woche wechseln, inaktiven Kurs im Nachlauf prüfen

---

## Anmerkungen / Defekte

| Datum | Tester:in | Browser | SR | Befund |
|-------|-----------|---------|-----|--------|
| | | | | |

Issue anlegen oder an [#171](https://github.com/CurlyKarin/yogaswap/issues/171) / [#113](https://github.com/CurlyKarin/yogaswap/issues/113) anhängen.

---

## Siehe auch

- [#199 — AdminPanel A11y (optional)](https://github.com/CurlyKarin/yogaswap/issues/199) — Landmark, Tabellen-Semantik, Formular-Labels
- Implementierte Teil-Tickets: #200 (Shell), #201 (Wochennavigation), #202 (Kurskarten), #196/#205 (Terminaktionen), #206 (Swap-Modal), #197/#209 (Chips/Badges)
