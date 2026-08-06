# CourseDateOverride als Delta (Issue #291)

## Problem

Overrides speichern heute eine **volle Teilnehmerliste** (`participants` = Snapshot).
Stamm-Änderungen müssen deshalb in zukünftige Overrides gespiegelt werden (#148 Add, #290 Remove).
Das ist fehleranfällig und unnötig, solange der Override die Stamm-Liste nachbaut.

## Ziel

Effektive Terminbelegung = **Stamm ⊕ Deltas**:

```text
effectiveNamed =
  (course.participants
    minus cancelledParticipants   // reguläre Absage RC: Slot frei
    minus (implizit: nicht in Stamm))
  union swapped                   // Termin-Zugänge (meist Tausch rein)

Kapazität / Occupancy =
  effectiveNamed.length
  + anonymousTrialCount           // Gäste
  // SN: Person bleibt in effectiveNamed und in shortNoticeCancellations (Slot belegt)
```

Override speichert **keine** parallele Stamm-Kopie mehr.

## Felder

| Feld | Rolle im Delta-Modell |
|------|------------------------|
| `cancelledParticipants` | Reguläre Absagen (RC) von Stamm-Personen an diesem Termin |
| `shortNoticeCancellations` | SN-Flags; Person bleibt effektiv belegt |
| `swapped` | Termin-Zugänge (Tausch rein / Promotion), die nicht (nur) über Stamm kommen |
| `waitlist` | Pending-Nachrücker / Tauschziele |
| `anonymousTrialCount` | Gastplätze |
| `participants` | **Legacy-Snapshot** — Reader leiten daraus Deltas ab; Writer schreiben leer `[]` bzw. setzen das Feld nicht mehr als Roster |

## Lesen (Legacy-Adapter)

Solange `cancelledParticipants` fehlt und `participants` wie ein alter Snapshot aussieht:

1. `cancelledParticipants` ≈ Stamm-Mitglieder, die **nicht** in `participants` stehen  
2. `swapped`-Zugänge ≈ Einträge in `participants`, die **nicht** im Stamm stehen (falls `swapped` leer)  
3. Effektive Liste entspricht dem bisherigen Snapshot-Verhalten

Neue Overrides: `participants: []`, Deltas nur in den Delta-Feldern.

## Schreiben (neu)

| Aktion | Override-Delta |
|--------|----------------|
| Gast ± | nur `anonymousTrialCount` (kein Stem-Copy) |
| RC Absage | User → `cancelledParticipants` |
| SN Absage | User → `shortNoticeCancellations` (bleibt effektiv belegt) |
| Tausch rein (active) | User → `swapped` (+ ggf. aus Waitlist) |
| Tausch raus (active Ursprung) | User → `cancelledParticipants` |
| Pending Ziel | User → `waitlist` |

## Stamm-Änderung (`updateCourse`)

| | Overrides | Swaps |
|--|-----------|-------|
| **Remove** | Person aus Deltas (Legacy-`participants`, `cancelledParticipants`, SN, Waitlist, `swapped`) | zukünftige Swaps **Ursprung = Kurs**, `user` = Person (+ Ziel-Waitlist/`swapped` bereinigen) |
| **Add** | Person aus Waitlist/`swapped`/`cancelledParticipants`/SN am Kurs (kein Snapshot-Copy) | zukünftige Swaps **Ziel = Kurs**, `user` = Person |

Snapshot-Sync (#148/#290) entfällt — Writer schreiben Deltas, Reader nutzen Stamm ⊕ Deltas.

## Pilot / Migration

Wenige oder keine produktiven Overrides → Hard-Cut vertretbar:

1. Reader mit Legacy-Adapter (bestehende Snapshots bleiben korrekt)
2. Writer ohne Stem-Copy
3. Optional: einmalig leere/`participants: []` für Overrides, die nur Gäste hatten

## Code

- Shared: `resolveEffectiveTermParticipants` / Occupancy-Helfer
- App: `useCourseCardTermState`, `dates`, `useCourseSwaps`
- Backend: `createSwap`, `processPromotions`, `ringSwapExecution`, `updateCourse`, Override-Lambdas
- Verwandt: `docs/guest-seats.md`, `docs/short-notice-cancellation.md`
