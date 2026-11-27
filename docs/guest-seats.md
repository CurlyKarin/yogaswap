# Gastplätze am Termin (Issue #39)

## Begriffe

| Feld / Label | Bedeutung |
|--------------|-----------|
| `anonymousTrialCount` | Anonyme Gastplätze am Termin-Override (technisch) |
| **Gast** | UI-Label für einen blockierten Platz ohne benannten User |

## Regeln

- Gäste zählen gegen **`maxCapacity`** (`capacity + overbookLimit`) wie reguläre Teilnehmer in der effektiven Belegung.
- Gäste können **nicht** auf die Warteliste — nur `anonymousTrialCount` am Override.
- **Wartelisten-Nachrücken:** nur wenn `participants.length < capacity` und effektive Belegung (Teilnehmer + Gäste) unter `capacity` liegt; Nachrücken über `processPromotions`.
- **Self-Service-Tausch:** reguläre Vollheit und Raumgrenze berücksichtigen Gäste (`hasRegularBookingCapacity`, `validateTermOccupancy`).
- **Staff Gast ± über `maxCapacity` (#427/#455):** Studio-Setting `staffOverCapacityMode` (`block` Default = Sperre, `warn` = Bestätigung). Bis zur Raumgrenze keine Extra-Warnung nur wegen Überplanungszone. Soft-Überschreiten: Request-Flag `confirmExceedMaxCapacity` an `createOverride` / `updateOverride` (nur bei `warn`). **Verringern** von Gästen ist immer erlaubt (auch wenn danach noch über der Grenze).

## Abgrenzung

- **Springer ohne Kurs / Kontingent** (ehemals #38): Pilotstudio regelt „warten auf Block-Platz“ und gelegentliche Mitnahme über Gastplätze. Ein gebuchtes Kontingent oder Kurse ohne Termine ist **nicht** spezifiziert — neues Ticket erst bei klarem Produkt. Richtung grob: eher `participant` + Settings, keine Rolle `trial` (`docs/multi-tenancy.md`).

## Code

- `shared/src/courseCapacity.ts` — `resolveGuestCount`, `resolveEffectiveOccupancy`, `validateTermOccupancy`, `canPromoteFromWaitlist`, `evaluateStaffOccupancy` (#427)
- Backend: `createOverride`, `updateOverride`, `processPromotions`, `promoteWaitlist`, `createSwap`, `ringSwapExecution`
- Dynamo: `overrideDynamo.mapOverrideItem` (`anonymousTrialCount`)
- Studio: `staffOverCapacityMode` in Studio-Einstellungen (#427)

## Subtickets

- #228 — Modell, API, Kapazität (dieses Dokument)
- #229 — Chip-Anzeige
- #230 — Plus/Minus UI
