# Durchlaufende Kurse (Rollkurse) — Planung und Sichtbarkeit

Dokumentation zu Issue [#165](https://github.com/CurlyKarin/yogaswap/issues/165): Rollkurse mit optionalem geplantem Kursende, ohne Wechsel in den Modus „Kursblock“.

## Eine Studio-Einstellung für Planung und Sichtbarkeit

Für `planningMode: rolling_continuous` gibt es **kein** separates Kursfeld `visibilityHorizonWeeks` mehr.

| Einstellung | Speicherort | Bedeutung |
|-------------|-------------|-----------|
| `rollingPlanningHorizonWeeks` | `TenantSettings` (Admin → Studio-Einstellungen) | Wochen ab heute: welche Serientermine existieren, was Teilnehmer sehen/tauschen dürfen, und innerhalb welcher Frist nur **Absage** statt **Ausschließen** möglich ist |
| `excludeLockWeeks` | Legacy in DynamoDB | Beim Lesen als Fallback für `rollingPlanningHorizonWeeks`; beim Speichern der Studio-Einstellungen migriert |

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

## Swaps und Cleanup

- In Produktion sind derzeit keine Rollkurse mit Swaps erwartet.
- Beim Setzen von `plannedEndDate` gibt es **keinen** aufwändigen Swap-Cleanup wie bei Terminabsage.
- Verwaiste Swaps außerhalb des sichtbaren Fensters gelten als **Fehldaten** (manuell bereinigen, falls nötig).

## Technik (Kurz)

- `deriveVisibleDates` (App + Backend): für Rollkurse `rollingPlanningHorizonWeeks` aus Tenant; optional `plannedEndDate` kürzt das Fensterende.
- `getCourses` lädt Tenant-Settings (`TENANTS_TABLE`) und leitet Termine für alle Kurse konsistent ab.
- `createCourse` / `updateCourse` persistieren `visibilityHorizonWeeks` nicht mehr.

## Verwandte Docs

- [Kursstatus und Sichtbarkeit](./course-status-visibility.md) — allgemeine Statuslogik und Studio-Nachlauf/Tauschfenster
