# Ringtausch-Engine (Issue #152)

## Ziel

Die Ringtausch-Engine loest blockierte Tauschketten fuer volle Zieltermine auf, wenn ein
gueltiger Zyklus aus pending Tauschanfragen existiert.

Beispiel: A will zu B, B will zu C, C will zu A. Wenn alle drei Anfragen zueinander passen,
kann der Tausch gleichzeitig aktiviert werden, obwohl kein direkter Einzeltausch moeglich ist.

## Trigger (Frontend)

`POST /process-ring-swaps` wird aktuell aufgerufen bei:

- **`requestSwap`** — nach dem Anlegen einer pending-Anfrage
- **`cancelSwap`** — nach dem Loeschen einer pending-Anfrage (kann einen neuen Ring ermoeglichen)

Fehler bei `processRingSwaps` blockieren `processPromotions` nicht.

## Abgrenzung zu `processPromotions`

| | `processRingSwaps` | `processPromotions` |
|---|---|---|
| Eingabe | pending Swaps bilden Zyklen | Overrides mit Warteliste + freiem regulärem Platz |
| Ausgabe | Ring aktiviert (`pending` → `active`) | Einzelner Nachruecker von Warteliste |
| Kapazitaet | Nur wenn Ring Teilnehmerzahl erhöht und > max | Nur reguläre Plätze (`capacity`) |
| Graph | Pro Lauf neu aufgebaut, nicht persistent | Kein Graph |

## Nicht-Ziele

- Kein Ersatz fuer direkten Einzeltausch (`confirmSwap`) oder Wartelisten-Nachruecken
- Keine persistente Speicherung des Graphen
- Keine Teil-Ausführung eines Zyklus bei Validierungsfehlern

## Datenmodell

Pending-Swaps werden als gerichteter Graph modelliert:

- **Knoten:** Ursprungstermin-Slot (`fromCourseId + fromDate`)
- **Kante:** pending Wunsch von `from` nach `to`
  - semantisch: "wenn ich `to` bekomme, gebe ich `from` frei"

Nur fachlich valide Kanten werden in den Graph aufgenommen (stimmige IDs, Daten vorhanden,
keine offensichtlichen Inkonsistenzen).

## Zyklus-Erkennung (ohne Rekursion)

Die Erkennung erfolgt iterativ (expliziter Stack/Queue), nicht rekursiv.

## Auswahlregeln

Wenn mehrere Zyklen gleichzeitig moeglich sind:

1. `findRingCycles` sortiert nach Zykluslaenge, dann lexikographisch (`cycleSignature`)
2. `selectDisjointCycles` wählt in dieser Reihenfolge konfliktfreie Zyklen (kein Swap/Knoten doppelt)

## Sicherheitsgrenzen (Guardrails)

Pro Lauf: max. Knoten/Kanten/Zykluslaenge/Anzahl Zyklen (`DEFAULT_RING_GRAPH_LIMITS`).

Bei Planungsfehler (Cutoff, fehlende Buchung am Ursprung): Zyklus komplett verworfen.

Raumkapazität: nur ablehnen, wenn der Ring die Teilnehmerzahl an einem Slot **erhöht** und dadurch `capacity + overbookLimit` überschreitet. Bereits überfüllte Slots (z. B. nach Kapazitätsänderung) blockieren keinen Ring, solange er die Zahl nicht weiter erhöht.

## Anwendung auf Daten

- `processRingSwaps` erkennt gueltige Zyklen und wendet sie atomar an (`TransactWriteItems` pro Zyklus).
- Beteiligte Swaps werden von `pending` auf `active` gesetzt; Overrides werden konsistent aktualisiert.
- Alternative pending Swaps desselben Nutzers vom selben Ursprung werden geloescht.
- Normales Wartelisten-Nachruecken bleibt in `processPromotions`.

## Ueberplanung und Ringtausch

- Direkter Einzeltausch: nur reguläre Plätze
- Ringtausch: Überplanungszone nutzbar; harte Raumgrenze nur bei **Netto-Zuwachs** durch den Ring

## Testmatrix

| Fall | Modul |
|---|---|
| 2er-/3er-Zyklus | `ringSwapGraph.test.ts`, `ringSwapExecution.test.ts` |
| Überlappende Zyklen | `ringSwapGraph.test.ts`, `ringSwapPipeline.test.ts` |
| Ungültige Kanten | `ringSwapGraph.test.ts` |
| Cutoff / Raumkapazität | `ringSwapExecution.test.ts` |
| Atomare Ausführung | `processRingSwaps/index.test.ts` |
| Frontend-Trigger | `useCourseSwaps.test.ts` |

## Betrieb/Logging

Pro Lambda-Lauf:

1. **Summary-Zeile** — Outcome, Kennzahlen, Ringkette(n)
2. **JSON bei Ausführung** — `event: ring_swap_executed` mit `activated`, `deletedAlternates`
3. **JSON bei Verwerfung** — `event: ring_swap_rejected` mit `reason`
4. **`console.warn`** — einzelne Verwerfungen/Konflikte während der Ausführung

Beispiel Summary:
```
[processRingSwaps] tenant=default-tenant | 1 Ring ausgeführt | pending=3 ... | Skye → Ivy → Skye
```
