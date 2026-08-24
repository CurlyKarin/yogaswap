# Kurzfristige Absage ohne Tausch (#167)

## Begriffe (nur Doku)

| Kürzel | Bedeutung |
|--------|-----------|
| **SN** | Short notice — kurzfristige Absage (im Cutoff-Fenster); Feld `shortNoticeCancellations` |
| **RC** | Regular cancellation — rechtzeitige Absage (vor Cutoff); nur aus `participants`, nicht in SN |

## Studio-Einstellung

- `cancellationSwapCutoffMinutesBeforeStart` (Default: **60**)
- `0` deaktiviert den Kurzfrist-Cutoff (keine automatische SN-Setzung, kein Cutoff-Block)
- Vergleich: Kursbeginn = `date` + `course.time` (lokal, wie `buildCourseOccurrenceLocal`)

## Datenmodell (Variante B)

`CourseDateOverride.shortNoticeCancellations`: Nicknames mit **kurzfristiger** Absage.

- Nutzer **bleibt** in `participants` (Slot bleibt belegt, kein Nachrücken).
- **Rechtzeitige (RC) Absage:** nur aus `participants`, nicht in SN — Tausch weiter möglich (auch wenn das Cutoff-Fenster später erreicht wird).

## SN-Rücknahme (Produktentscheidung)

**Kurzfristige Absage kann jederzeit zurückgenommen werden** — auch im Cutoff.

- Aktion: Eintrag aus `shortNoticeCancellations` entfernen; `participants` **unverändert** (Platz war ohnehin belegt).
- UI: Button **„Absage zurücknehmen“** bei SN immer sichtbar.
- **Kein** neuer Tausch vom Termin, solange die Person im Cutoff noch normal eingetragen ist und kein RC-Fall vorliegt (weiter `createSwap`-Sperre im Cutoff).

## RC-Rücknahme (rechtzeitig abgesagt)

RC-Rücknahme ist möglich (auch im Cutoff), wenn noch Platz frei ist. Vor dem Ausführen erscheint ein Bestätigungsdialog.

| Szenario | Verhalten |
|--------|-----------|
| RC + **pending** Swaps vorhanden | Warnung; bei Bestätigung werden pending Swaps vom Ursprung gelöscht (Anspruch auf Ersatz erlischt) |
| RC + **keine** Swaps | Warnung; bei Bestätigung Rücknahme der Absage |
| RC + **aktiver zukünftiger** Swap | Warnung; bei Bestätigung wird der aktive Swap aufgehoben |
| RC + **aktiver vergangener** Swap | Kein Rücknahme-Button (auch außerhalb Cutoff) |

## Abgrenzung

| Thema | Feld / Logik |
|--------|----------------|
| Welche Zieltermine wählbar sind | Rollkurse: `minOffsetDays` / `maxOffsetDays`. Kursblöcke: Zukunftstermine bis inklusivem `seriesEndDate` (#296). |
| Ob kurz vor Start noch getauscht werden darf | `cancellationSwapCutoffMinutesBeforeStart` |

## Pending-Aufräumen

Beim Laden (`getSwaps`, `getSwapsByStatus`): `pending`-Swaps, deren **Ursprung** im Cutoff liegt, werden entfernt und Wartelisten am Ziel bereinigt (`swapCutoffReconcile`).

**Ziel im Cutoff:** keine neuen Tauschanfragen oder Wartelisten-Einträge (UI `getAvailableDates`/`getWaitlistDates`, `requestSwap`/`confirmSwap`, API `createSwap`) — konsistent mit `processPromotions`, das in diesem Fenster nicht nachrückt.

Bei kurzfristiger Absage am Ursprung: dieselbe Bereinigung in der App (`cleanupPendingSwapsFromOrigin`).

## UI

- Kurzfristig abgesagte: Chip-Klasse `short-notice` (analog `swapped`).
- Validierung: UI + Backend (`createSwap`, `updateOverride`).
