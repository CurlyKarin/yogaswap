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

## Code

- `shared/src/courseCapacity.ts` — `resolveGuestCount`, `resolveEffectiveOccupancy`, `validateTermOccupancy`, `canPromoteFromWaitlist`
- Backend: `createOverride`, `updateOverride`, `processPromotions`, `createSwap`, `ringSwapExecution`
- Dynamo: `overrideDynamo.mapOverrideItem` (`anonymousTrialCount`)

## Subtickets

- #228 — Modell, API, Kapazität (dieses Dokument)
- #229 — Chip-Anzeige
- #230 — Plus/Minus UI
