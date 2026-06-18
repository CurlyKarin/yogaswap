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
- **Wartelisten-Nachrücken:** nur wenn `participants.length < capacity` und noch unter `maxCapacity` (`canPromoteFromWaitlist`).
- **Ringtausch:** unverändert; Zieltermine unterliegen derselben Obergrenze.
- **Teilnehmer (Stammdaten):** Admin-Mitglieder-Dialog begrenzt auf `maxCapacity`.

## Code

- `shared/src/courseCapacity.ts` — zentrale Helfer
- Backend: `createCourse`, `updateCourse`, `createOverride`, `updateOverride`, `processPromotions`, `createSwap` (active)
- App: `useCourseSwaps`, `dates.ts`, `CourseCard`, Dialoge

## Follow-ups

- #39 — Gastplätze am Termin (`anonymousTrialCount`, siehe `docs/guest-seats.md`)
- #180 — Vertretungsmodus: benannte Zuweisung in Überplanung (Post-Rollout)
