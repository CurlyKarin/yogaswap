# Durchlaufende Kurse (Rollkurse) — Planung und Sichtbarkeit

Dokumentation zu Issue [#165](https://github.com/CurlyKarin/yogaswap/issues/165): Rollkurse mit optionalem geplantem Kursende, ohne Wechsel in den Modus „Kursblock“.

## Eine Studio-Einstellung für Planung und Sichtbarkeit

Für `planningMode: rolling_continuous` gibt es **kein** separates Kursfeld für ein Sichtfenster — nur die Studio-Einstellung unten.

| Einstellung | Speicherort | Bedeutung |
|-------------|-------------|-----------|
| `rollingPlanningHorizonWeeks` | `TenantSettings` (Admin → Studio-Einstellungen) | Wochen ab heute: welche Serientermine existieren, was Teilnehmer sehen/tauschen dürfen, und innerhalb welcher Frist nur **Absage** statt **Ausschließen** möglich ist (bei aktivem Kurs) |

**Default:** 5 Wochen.

### Konsequenzen

- **Teilnehmer** sehen und tauschen nur Termine innerhalb der N Wochen (`deriveVisibleDates` mit Studio-Wert).
- **Admin und Kursleiter** planen im UI mit langem Kalenderhorizont (~156 Wochen); `excludedDates` für Ferien o. Ä. sind dort möglich.
- **Planungssperre** (= Teilnehmer-Sichtfenster), nur bei **aktivem** Kurs: innerhalb der N Wochen nur **Absage**, kein Ausschließen; außerhalb der N Wochen (bis Admin-Horizont) Ausschließen im Termin-Dialog.
- **Entwurf** (`draft`): Terminplanung inkl. Ausschließen im gesamten Admin-Horizont (auch innerhalb der N Wochen). Inaktive Rollkurse: kein separater Ausschluss-Kalender (Scope bewusst eng).
- Früheres Beenden eines Rollkurses: `plannedEndDate` im Kursdialog (nicht vor Ende der Planungssperre). Termine danach fallen aus der Ableitung; einzelne Termine davor nur per Absage.

## Geplantes Kursende (`plannedEndDate`)

- Nur für aktive Rollkurse mit Teilnehmern (statt Status `inactive`).
- Mindestdatum: Ende der Planungssperre (= Studio-Fenster ab heute).
- „Unbefristet“ entfernt das Feld wieder.
- Beim **Setzen, Ändern oder Aufheben** des Kursendes (`PUT /courses/{courseId}`) erhalten eingetragene Kursteilnehmer mit Login eine **E-Mail** (wie bei Terminabsage; nur eingeladene ohne Login werden übersprungen).

## Swaps und Cleanup

- In Produktion sind derzeit keine Rollkurse mit Swaps erwartet.
- Beim Setzen von `plannedEndDate` gibt es **keinen** aufwändigen Swap-Cleanup wie bei Terminabsage.
- Verwaiste Swaps außerhalb des sichtbaren Fensters gelten als **Fehldaten** (manuell bereinigen, falls nötig).
- **After Rollout (Modell-Mix):** Diskussion Cleanup vs. erzwungene Absagen vs. Tausch-Regeln — GitHub [#174](https://github.com/CurlyKarin/yogaswap/issues/174).

## Studio-Fenster verkleinern

**Guard beim Speichern (`PUT /tenant-settings`):**

- Wird `rollingPlanningHorizonWeeks` **verkleinert**, prüft das Backend den Zeitraum zwischen neuem und altem Fensterende (nur für `rolling_continuous`-Kurse).
- Gibt es dort noch **`pending`/`active` Swaps** oder Overrides mit Teilnehmern/Swap/Warteliste → Speichern wird mit **400** abgelehnt (gemeinsame Logik in `shared/rollingHorizonShrink.ts`, Dynamo-Laden in `horizonShrinkGuard.ts`).
- **Erhöhen** des Fensters ist unkritisch.

**Nach erfolgreichem Speichern (ohne Migration):**

- Wirkt **sofort** auf alle Rollkurse beim nächsten `GET /courses`: `dates` / `visibleDates` werden mit dem **neuen** N aus `deriveVisibleDates` neu abgeleitet.
- Gespeicherte `excludedDates` weit in der Zukunft **bleiben** in DynamoDB.
- Verwaiste Swaps außerhalb des Fensters (falls Guard umgangen oder Altbestand) → [#174](https://github.com/CurlyKarin/yogaswap/issues/174).

## Technik (Kurz)

- `deriveVisibleDates` (App + Backend): für Rollkurse `rollingPlanningHorizonWeeks` aus Tenant; optional `plannedEndDate` kürzt das Fensterende.
- `getCourses` lädt Tenant-Settings (`TENANTS_TABLE`) und leitet Termine für alle Kurse konsistent ab.
- `createCourse` / `updateCourse` speichern nur noch Studio-Fenster + Kurs-Ausnahmen (`excludedDates`).

## Verwandte Docs

- [Kursstatus und Sichtbarkeit](./course-status-visibility.md) — allgemeine Statuslogik und Studio-Nachlauf/Tauschfenster
