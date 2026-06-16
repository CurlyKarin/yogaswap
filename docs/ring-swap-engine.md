# Ringtausch-Engine (Issue #152)

## Ziel

Die Ringtausch-Engine loest blockierte Tauschketten fuer volle Zieltermine auf, wenn ein
gueltiger Zyklus aus pending Tauschanfragen existiert.

Beispiel: A will zu B, B will zu C, C will zu A. Wenn alle drei Anfragen zueinander passen,
kann der Tausch gleichzeitig aktiviert werden, obwohl kein direkter Einzeltausch moeglich ist.

## Trigger

Der Graph wird nicht persistent gespeichert, sondern pro Lauf neu aufgebaut.

Empfohlene Trigger:
- neue pending Tauschanfrage
- Abbruch/Loeschung einer pending Anfrage
- relevante Statusaenderungen (`pending`/`active`) in Swap-Daten

Dadurch bleibt die Berechnung robust gegen veraenderte Realitaet (Absagen, neue Anfragen,
kurzfristige Aenderungen).

## Datenmodell

Pending-Swaps werden als gerichteter Graph modelliert:

- **Knoten:** Ursprungstermin-Slot (`fromCourseId + fromDate`)
- **Kante:** pending Wunsch von `from` nach `to`
  - semantisch: "wenn ich `to` bekomme, gebe ich `from` frei"

Nur fachlich valide Kanten werden in den Graph aufgenommen (stimmige IDs, Daten vorhanden,
keine offensichtlichen Inkonsistenzen).

## Zyklus-Erkennung (ohne Rekursion)

Die Erkennung erfolgt iterativ (expliziter Stack/Queue), nicht rekursiv.

Gruende:
- besser kontrollierbar bei groesseren Datenmengen
- keine Stack-Overflow-Risiken
- einfachere Betriebsgrenzen (Limits, Timeout, sauberes Abort-Verhalten)

## Auswahlregeln

Wenn mehrere Zyklen gleichzeitig moeglich sind:
- deterministische Reihenfolge (stabile Sortierung)
- ein Swap darf pro Lauf nur in einem ausgefuehrten Zyklus vorkommen
- ueberschneidende Zyklen werden konfliktfrei priorisiert

Die konkrete Priorisierungsregel wird im Code dokumentiert und testbar gemacht.

## Sicherheitsgrenzen (Guardrails)

Pro Lauf werden feste Grenzen eingehalten:
- max. Knoten
- max. Kanten
- max. Zykluslaenge
- max. Anzahl auszufuehrender Zyklen
- Zeitlimit

Bei Ueberschreitung: keine Teilanwendung, stattdessen sauber loggen und Lauf beenden.

## Anwendung auf Daten

- `processRingSwaps` erkennt gueltige Zyklen und wendet sie atomar an (`TransactWriteItems` pro Zyklus).
- Beteiligte Swaps werden von `pending` auf `active` gesetzt; Overrides (participants/swapped/waitlist) werden konsistent aktualisiert.
- Schlaegt ein Zyklus fehl (Validierung oder Transaktionskonflikt), wird er verworfen — kein Halbzustand.
- Normales Wartelisten-Nachruecken bleibt in `processPromotions` und wird nicht ersetzt.

## Ueberplanung und Ringtausch

Ringtausch ist fachlich unabhaengig von den Self-Service-Tauschregeln fuer ueberplante Kurse:

- Der direkte Einzeltausch (ohne Zyklus) bleibt auf regulaere Plaetze begrenzt.
- Im Ringtausch darf jedoch auch ein aktuell ueberplanter Platz Teil eines gueltigen Zyklus sein.
- Ein Platz in der Ueberplanung kann damit grundsaetzlich ueber Ringtausch weitergegeben werden,
  sofern der gesamte Zyklus konsistent und atomar ausfuehrbar ist.

Diese Regel ist bei Zyklus-Validierung und Ausfuehrung explizit zu beruecksichtigen.

## Teststrategie

Mindestens folgende Faelle:
- 2er-Zyklus (A <-> B)
- 3er-Zyklus (A -> B -> C -> A)
- ueberschneidende Zyklen (Konfliktaufloesung)
- ungueltige/inkonsistente Kanten
- Limit-/Abbruchverhalten

## Betrieb/Logging

Jeder Lauf loggt strukturiert:
- Anzahl geladener pending Swaps
- Anzahl gueltiger Kanten
- gefundene Zyklen
- ausgewaehlte/verworfene Zyklen inkl. Grund
- Laufzeit und ggf. Guardrail-Abbruch

Damit bleiben Entscheidungen nachvollziehbar und debugbar.
