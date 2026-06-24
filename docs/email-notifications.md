# E-Mail-Benachrichtigungen (#45)

Stand: Inventar und Zielbild für Erweiterungen. Issue [#45](https://github.com/CurlyKarin/yogaswap/issues/45) fragt u. a., **wann Trainer:innen** und **wann Teilnehmer:innen** per E-Mail informiert werden sollen.

Technik: **AWS SES** (`SendEmailCommand`), Absender `SES_SOURCE_EMAIL`. Cognito-Versand ist überall unterdrückt (`MessageAction: SUPPRESS`); Auth-Mails laufen über eigene Token-Links.

---

## Bereits implementiert

### Übersicht

| Ereignis | Lambda | Empfänger | Template / Inhalt | Voraussetzungen / Skip |
|----------|--------|-----------|-------------------|------------------------|
| **Einladung (neu)** | `createParticipants` | Teilnehmer:in (E-Mail aus Request) | `buildInviteMail` | E-Mail im Request; `AUTH_TOKENS_TABLE`; SES-Fehler blockiert Anlage nicht |
| **Reaktivierung Studio-Zugang** | `createParticipants` | Bestehende aktive Profile | `buildReactivationMail` | Reaktivierung ohne E-Mail im Request, aber Profil-E-Mail vorhanden |
| **Passwort-Reset (Admin)** | `resetParticipantPassword`, `updateParticipant` | Zielprofil | `buildRecoveryMail` | Admin-Aktion; aktives Profil mit E-Mail |
| **Passwort-Reset (Self-Service)** | `requestSelfPasswordReset` | Bekannter Nickname | `buildRecoveryMail` | Generische 200-Antwort bei unbekanntem User (Enumeration-Schutz) |
| **E-Mail-Adresse geändert** | `updateParticipant` | Neue + ggf. alte Adresse | `buildEmailChangedNewAddressMail`, `buildEmailChangedOldAddressMail` | Nur bei aktivem Login-Status |
| **Rolle geändert** | `updateParticipant` | Zielprofil | `buildRoleChangedMail` | Membership-Update mit Rollenwechsel |
| **Studio-Zugang entfernt** | `deleteParticipant` | Zielprofil | `buildStudioAccessRemovedMail` | Nur wenn `inviteCompletedAt` gesetzt (Login-Historie) |
| **Termin abgesagt** | `cancelCourseDate` | Gebuchte, getauschte, Wartelisten- und bereits abgemeldete TN am Termin | Inline-HTML (kein Template-Modul) | Skip: kein Profil, kein E-Mail, Status `invited` |
| **Terminabsage Studio-Report** | `cancelCourseDate` | `STUDIO_NOTIFICATION_EMAILS` (Infra-Env, CSV) | Inline-HTML Report | Optional; Fehler nur als Warning |
| **Geplantes Kursende gesetzt** | `updateCourse` → `notifyParticipantsPlannedEndDate` | Alle `course.participants` | `buildPlannedEndDateMail` | Rollkurs `active` mit TN; Skip: `invited`, kein Profil |
| **Geplantes Kursende aufgehoben** | `updateCourse` → `notifyParticipantsPlannedEndDate` | Alle `course.participants` | `buildPlannedEndDateClearedMail` | wie oben |

### Template-Module

| Modul | Pfad |
|-------|------|
| Auth | `backend/src/lambdas/shared/templates/auth/authMailTemplates.ts` |
| Kurs | `backend/src/lambdas/shared/templates/course/courseMailTemplates.ts` |
| Geplantes Kursende (Versand) | `backend/src/lambdas/shared/plannedEndDateNotifications.ts` |

### Hilfslogik

- **Profil + E-Mail auflösen:** `backend/src/lambdas/shared/participantEmailLookup.ts` (`resolveParticipantEmail`)
- **Locale:** `MAIL_LOCALE` (Default `de`)
- **Login-Links:** `BASE_URL`

### Vorhanden, aber ungenutzt

| Template | Status |
|----------|--------|
| `buildInvitePreparationMail` | Nur in Tests; kein Lambda-Versand |

### Bewusst **ohne** E-Mail heute

| Bereich | Lambdas / Flows |
|---------|-----------------|
| Tauschanfrage / -bestätigung / -ablehnung | `createSwap`, `updateSwap`, `deleteSwap` |
| Nachrücken Warteliste | `processPromotions` |
| Ringtausch-Ausführung | `processRingSwaps` |
| Kurs-Mitgliedschaft ändern | `updateCourse` (`participants`), `createOverride`, … |
| Kurzfrist-Absage (SN) / RC-Rücknahme | App + `updateOverride` |
| Tenant-/Studio-Einstellungen | `updateTenantSettings` |

---

## Produktentscheidungen (Stand Team)

### MVP-Priorität Teilnehmer:innen

| Prio | Ereignis | Inhalt | Trigger / Lambda |
|------|----------|--------|------------------|
| **1** | **Nachrücken von Warteliste** | Bestätigung mit **konkretem Termin** (Kurs, Datum, Uhrzeit) | `processPromotions` |
| **2** | **Tausch erfolgreich** | Bestätigung mit Zieltermin; bei jedem erfolgreichen Tausch sinnvoll (inkl. klar freier Platz, Ringtausch) | `updateSwap` / `processRingSwaps` |
| **3** | **Kursbeitritt** | Willkommen + Kursinfo; ggf. **Kalenderelement** für Serientermine | siehe unten |

**Nicht in MVP:** Tausch**anfragen** (eingehend/ausgehend) — potenziell zu viel Lärm; erst nach Erfahrung im Betrieb entscheiden.

### Kursbeitritt — wann mailen?

| Situation | Empfänger | Anmerkung |
|-----------|-----------|-----------|
| Person wird zu **`active`** Kurs in `course.participants` hinzugefügt | die hinzugefügte Person | Abgrenzung: Studio-**Einladung** (`createParticipants`) bleibt separat |
| Kurs wechselt **`draft` → `active`** | alle aktuell in `course.participants` | einmalige „Kurs ist live“-Mail; nicht bei jedem späteren Edit |

Keine Mail bei reinem Entfernen aus der Liste (dafür ggf. später separat).

### Trainer / Kursleitung (MVP)

Mail bei **relevanten Änderungen an der Teilnehmerliste** des Kurses (Hinzufügen, Entfernen — nicht jede Override-Änderung pro Termin im ersten Wurf).

| Bewusst nicht MVP | Grund |
|-------------------|--------|
| **Gäste** | meist selbst durch Leitung eingetragen |
| **Tauschanfragen** (jede Richtung) | zu granular; siehe Digest-Zukunft |
| **Einzelmail pro Kleinigkeit** | siehe Zukunftsplanung |

Zugeordnete Instructor:innen aus `course.instructors` (nicht ganzes Studio), sofern nicht anders konfiguriert.

### Kalender-Anhang (ICS) — Zielbild

Für Mails mit **festem Termin** (Nachrücken, erfolgreicher Tausch, ggf. Kursbeitritt):

- **`.ics`-Anhang** (`text/calendar`, `METHOD:PUBLISH`) oder eingebetteter Link — „In Kalender übernehmen“
- Felder: `DTSTART`/`DTEND` aus `date` + `course.time`, `SUMMARY` (Kursname), `LOCATION` optional, `DESCRIPTION` mit Studio/Kurs-Link
- **Serienkurs:** bei Kursbeitritt / Aktivierung eher **mehrere VEVENTs** (sichtbare `dates`) oder Hinweis „Termine in der App“ — nicht ein einzelnes ICS für die ganze Serie ohne Abstimmung
- SES: `SendEmailCommand` mit `RawMessage` oder Multipart-MIME (noch nicht im Code)

Damit wird „Tausch bestätigt“ nicht nur Text, sondern direkt kalenderfähig — gilt für Ringtausch und Direkttausch gleichermaßen.

### Zukunftsplanung (nicht MVP)

- **Digest / Sammel-Updates** in festen Abständen, wenn es Änderungen gab (Tauschaktivität, Teilnehmerliste, …) — statt E-Mail bei jeder Kleinigkeit
- UI-Schalter Studio / persönlich (Architektur unten vorgesehen)
- Tausch**anfrage**-Mails, falls sich der Bedarf zeigt

---

## Lücken nach Priorität (technisch)

### Teilnehmer:innen — MVP (#45)

| Ereignis | Lambda | Kalender |
|----------|--------|----------|
| Nachrücken Warteliste | `processPromotions` | ja (ein Termin) |
| Tausch erfolgreich | Swap-Ausführung | ja (Zieltermin) |
| Kursbeitritt / Kurs aktiv | `updateCourse` | optional (Serie → siehe oben) |

### Teilnehmer:innen — zurückgestellt

| Ereignis | Anmerkung |
|----------|-----------|
| Tauschanfrage eingegangen | zu viel für MVP |
| Tausch abgelehnt / zurückgezogen | optional später |
| Termin-Erinnerung | P3 |

### Trainer — MVP

| Ereignis | Anmerkung |
|----------|-----------|
| Teilnehmerliste geändert (add/remove Stamm) | `updateCourse` `participants` |
| Terminabsage im eigenen Kurs | ergänzt bestehenden Studio-Report |

### Trainer — zurückgestellt

| Ereignis | Anmerkung |
|----------|-----------|
| Gäste | nicht MVP |
| Offene Tauschanfrage | Digest-Zukunft |
| Kurzfristige Absage (SN) | später |

### Studio / Admin (P2)

| Ereignis | Anmerkung |
|----------|-----------|
| Tausch-Aktivität (Digest) | Zukunftsplanung |
| Kurs ohne Leitung / Kapazitätsengpass | Reporting |

### Später (P3)

- Gastplätze
- Kursplan-Fenster geändert (viele Empfänger → Digest)
- Erinnerung vor Termin
- Inaktiv-/Nachlauf-Hinweise

---

## Wichtigste Lücken (ältere Prioritätsliste — ersetzt durch Abschnitt oben)

<details>
<summary>Archivierte erste Brainstorm-Tabelle</summary>

### Teilnehmer:innen (P1)

| Ereignis | Warum wichtig | Anmerkung |
|----------|---------------|-----------|
| **Tauschanfrage eingegangen** | Gegenpartei muss reagieren | → zurückgestellt |
| **Tausch bestätigt / ausgeführt** | Beide Seiten brauchen Bestätigung | → MVP mit ICS |
| **Tausch abgelehnt / zurückgezogen** | Erwartungsmanagement | → später |
| **Nachrücken von Warteliste** | Zeitkritisch | → MVP #1 |
| **Neuer Kurs / Kursbeitritt** | Aufnahme in `course.participants` | → MVP #3 |

</details>


## Schalter: Studio vs. persönlich

**MVP (#45):** Keine UI-Schalter — Verhalten wie heute (senden, wo implementiert). Architektur soll Erweiterung vorbereiten.

### Entscheidungslogik (Ziel)

```
effektiv = persönliche Einstellung ?? studioDefault ?? systemDefault
```

- **System-Default:** pro Ereignistyp dokumentiert (meist „senden“, außer Security-Mails).
- **Studio-Default:** Tenant-weit, vom Admin steuerbar.
- **Persönlich:** später pro Profil überschreibbar (Opt-out oder Opt-in je Kategorie).

Security-relevante Mails (Passwort-Reset, E-Mail-Änderung, Zugang entfernt) sollten **nicht** abschaltbar sein oder nur mit hartem Admin-Override.

### Vorgeschlagene Datenstruktur

Erweiterung `TenantSettings` (`shared/src/types.ts`), alle Felder optional — `undefined` = bisheriges Verhalten:

```ts
/** Studio-Defaults für E-Mail-Benachrichtigungen (noch nicht implementiert). */
export interface TenantEmailNotificationDefaults {
  /** Terminabsage: Teilnehmer am betroffenen Termin */
  courseDateCancelledParticipants?: boolean;
  /** Terminabsage: zugeordnete Instructor:innen */
  courseDateCancelledInstructors?: boolean;
  /** Terminabsage: Studio-Report (heute STUDIO_NOTIFICATION_EMAILS) */
  courseDateCancelledStudioReport?: boolean;

  swapRequestReceived?: boolean;       // Default false / MVP aus
  swapExecuted?: boolean;              // erfolgreicher Tausch inkl. ICS
  swapOutcome?: boolean;               // abgelehnt, zurückgezogen — später
  waitlistPromotion?: boolean;
  courseMembershipAdded?: boolean;
  courseActivated?: boolean;           // draft → active an alle Stamm-TN
  instructorParticipantListChanged?: boolean;
  plannedEndDateChanged?: boolean;

  /** Später: Digest statt Einzelmail */
  swapActivityDigest?: boolean;
}

// In TenantSettings:
emailNotifications?: TenantEmailNotificationDefaults;
```

Persönliche Overrides später am `ParticipantProfile` (analog zu `settings` am Profil):

```ts
export interface ParticipantNotificationPreferences {
  courseDateCancelled?: boolean;
  swapRequestReceived?: boolean;
  swapExecuted?: boolean;
  swapOutcome?: boolean;
  waitlistPromotion?: boolean;
  courseMembershipAdded?: boolean;
  courseActivated?: boolean;
  plannedEndDate?: boolean;
  /** true = nur Digest (wenn Studio Digest anbietet) */
  preferDigest?: boolean;
}
```

### Zentrale Versand-Schicht (Ziel-Architektur)

Neue Shared-Schicht, z. B. `backend/src/lambdas/shared/notifications/`:

1. **`NotificationEvent`** — enum/Union aller Ereignistypen
2. **`resolveNotificationEnabled(tenant, profile, event)`** — heute: immer `true` außer hart codierten Skips (`invited`, fehlende E-Mail)
3. **`sendNotification({ event, tenantId, recipients, payload })`** — SES + Template + Logging (`mailSentCount`, … wie `cancelCourseDate`)
4. **Lambdas** rufen nur noch `sendNotification` auf — keine verstreuten `SendEmailCommand`

Vorteil: Schalter, Locale, Metriken und Templates an einer Stelle; `STUDIO_NOTIFICATION_EMAILS` kann später in `TenantSettings.studioNotificationEmails` wandern.

### Was in v1 trotzdem schon mitdenken

| Thema | Empfehlung |
|-------|------------|
| Neue Mail | `courseMailTemplates` / `swapMailTemplates.ts`; ICS-Helfer z. B. `buildIcsEventAttachment` |
| Empfängerliste | Immer über `resolveParticipantEmail`; Instructor:innen aus `course.instructors` |
| Fehler | Nicht-blockierend für Hauptaktion (wie heute bei `createParticipants` / `cancelCourseDate`) |
| Logging | Einheitliches JSON-Summary pro Versand |
| Tests | Template-Unit-Tests + Lambda-Integration mit gemocktem SES |

---

## Offene Produktfragen

| # | Frage | Stand |
|---|--------|-------|
| 1 | Trainer:in — nur `course.instructors`? | **Ja** (Vorgabe MVP) |
| 2 | Tauschanfrage sofort mailen? | **Nein** für MVP; Digest später |
| 3 | Kursbeitritt — wann? | **Entschieden:** add zu active + draft→active |
| 4 | Studio-Report konfigurierbar? | offen (`STUDIO_NOTIFICATION_EMAILS` vs. Tenant) |
| 5 | Opt-out kursbezogene Mails? | Architektur ja; UI später |
| 6 | ICS bei Kursbeitritt Serienkurs | offen: ein Event vs. Liste vs. nur Link zur App |

---

## Nächste Schritte (Vorschlag)

1. ~~Produktentscheid P1~~ (siehe „Produktentscheidungen“)
2. `sendNotification`-Gerüst + `NotificationEvent` + ICS-Helfer (ohne UI-Schalter)
3. **Reihenfolge Implementierung:** Nachrücken → Tausch erfolgreich (+ ICS) → Kursbeitritt → Trainer Teilnehmerliste
4. `TenantSettings.emailNotifications` als Typ + Resolver (Defaults = MVP-Entscheidungen)
5. Instructor-Mails Teilnehmerliste + optional Terminabsage
6. UI-Schalter / Digest in separaten Issues

## Verwandte Doku

- `docs/short-notice-cancellation.md` — Kurzfrist-Absage (ohne Mail)
- `docs/course-views.md` — Tausch-UI
- `README.md` — SES-Einrichtung, Sandbox
