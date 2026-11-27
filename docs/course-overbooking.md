# Kontrollierte Überplanung (Issue #153)

## Begriffe

| Feld | Bedeutung |
|------|-----------|
| `capacity` | Reguläre Kurskapazität (Warteliste rückt nur nach, wenn weniger Teilnehmer eingetragen sind) |
| `overbookLimit` | Zusätzliche Plätze über `capacity` (nur Admin/Trainerin konfigurierbar) |
| `maxCapacity` | Harte Raumgrenze = `capacity + overbookLimit` |

Anzeige in der Kurskarte: `Teilnehmer/regulär` und für Management optional `(+overbookLimit)`, z. B. `6/4 (+2)`.

## Regeln

- **Tausch (Self-Service):** nur reguläre Plätze (`capacity`); Überplanungszone nicht als Ziel wählbar (App: `hasRegularBookingCapacity`, `getAvailableDates`; API: `createSwap` active).
- **Raumgrenze / Admin-Zuweisung:** bis `maxCapacity` (API: `validateParticipantListSize`, App: `hasBookingCapacity`).
- **Wartelisten-Nachrücken (automatisch):** nur wenn `participants.length < capacity` und noch unter `maxCapacity` (`canPromoteFromWaitlist`).
- **Staff-Übernahme von der Warteliste (#427):** gezielt eine WL-Person am Termin → pending Swap aktivieren. Bis `maxCapacity` ohne Extra-Warnung; darüber Studio-Setting `staffOverCapacityMode` (`block` Default / `warn`, #455). Auch im Cutoff mit Extra-Bestätigung.
- **Ringtausch:** unverändert; Zieltermine unterliegen derselben Obergrenze.
- **Teilnehmer (Stammdaten):** Admin-Mitglieder-Dialog begrenzt auf `maxCapacity`.

## Code

- `shared/src/courseCapacity.ts` — zentrale Helfer inkl. `evaluateStaffOccupancy` (#427)
- Backend: `createCourse`, `updateCourse`, `createOverride`, `updateOverride`, `processPromotions`, `promoteWaitlist`, `createSwap` (active)
- App: `useCourseSwaps`, `dates.ts`, `CourseCard`, Dialoge, Studio-Einstellung „Raumgrenze überschreiten (Staff)“

## Follow-ups

- #39 — Gastplätze am Termin (`anonymousTrialCount`, siehe `docs/guest-seats.md`)
- #180 — Vertretungsmodus: benannte Zuweisung in Überplanung (Post-Rollout)
