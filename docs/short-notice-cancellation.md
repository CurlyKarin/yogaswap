# Kurzfristige Absage ohne Tausch (#167)

## Studio-Einstellung

- `cancellationSwapCutoffMinutesBeforeStart` (Default: **60**)
- Vergleich: Kursbeginn = `date` + `course.time` (lokal, wie `buildCourseOccurrenceLocal`)

## Datenmodell (Variante B)

`CourseDateOverride.shortNoticeCancellations`: Nicknames mit **kurzfristiger** Absage.

- Nutzer **bleibt** in `participants` (Slot bleibt belegt, kein Nachrücken).
- **Rechtzeitige** Absage: nur aus `participants`, nicht in SN — Tausch weiter möglich (auch wenn das Cutoff-Fenster später erreicht wird).

## Abgrenzung

| Thema | Feld / Logik |
|--------|----------------|
| Welche Zieltermine wählbar sind | `minOffsetDays` / `maxOffsetDays` |
| Ob kurz vor Start noch getauscht werden darf | `cancellationSwapCutoffMinutesBeforeStart` |

## Pending-Aufräumen

Beim Laden (`getSwaps`, `getSwapsByStatus`): `pending`-Swaps, deren **Ursprung** im Cutoff liegt, werden entfernt und Wartelisten am Ziel bereinigt (`swapCutoffReconcile`).

Bei kurzfristiger Absage am Ursprung: dieselbe Bereinigung in der App (`cleanupPendingSwapsFromOrigin`).

## UI

- Kurzfristig abgesagte: Chip-Klasse `short-notice` (analog `swapped`).
- Validierung: UI + Backend (`createSwap`, `updateOverride`).
