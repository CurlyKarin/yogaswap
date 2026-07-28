# E-Mail-Benachrichtigungen (#45)

Stand: **MVP Teilnehmer-Benachrichtigungen implementiert** (Issue [#45](https://github.com/CurlyKarin/yogaswap/issues/45)). Dieses Dokument ist Inventar, Produktentscheidungen und Zielbild für Folgearbeit (Trainer:in, Schalter, Digest).

Technik: **AWS SES** — `SendEmail` (HTML) und `SendRawEmail` (HTML + `.ics`-Anhang). Absender `SES_SOURCE_EMAIL` (Rollout: `noreply@yogaswap.de`). App-Auth (Invite/Reset-Token) unterdrückt Cognito-Mails (`MessageAction: SUPPRESS`) und nutzt eigene Templates. Cognito-Code-Mails (Forgot/Admin-Reset) gehen über denselben SES-Absender (`email_sending_account = DEVELOPER`, #106) mit deutschen Custom-Message-Texten (#107/#108). Domain/Production: [`docs/ses-production.md`](./ses-production.md) (#80). QA/Freigabe Auth-Mails: [`docs/cognito-mail-qa.md`](./cognito-mail-qa.md) (#109).

### MVP #45 — Umsetzungsstand (Teilnehmer:innen)

| Prio | Ereignis | Status |
|------|----------|--------|
| 1 | Nachrücken Warteliste | ✓ HTML + ICS |
| 2 | Tausch erfolgreich | ✓ HTML + ICS (`createSwap`/`updateSwap`/`processRingSwaps`) |
| 3 | Kursbeitritt / Kurs aktiv | ✓ HTML (ohne Serien-ICS) |
| + | Studio-Terminabsage | ✓ `buildStudioTermCancelledMail` |
| + | Selbst-Freigabe (rechtzeitig) | ✓ `buildParticipantTermReleasedMail` |

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
| **Termin absgesagt (Studio)** | `cancelCourseDate` | Gebuchte, getauschte, Wartelisten- und abgemeldete TN am Termin | `buildStudioTermCancelledMail` (Datum + Uhrzeit, `de-DE`) | Skip: `invited`, kein Profil; kein ICS |
| **Terminabsage Studio-Report** | `cancelCourseDate` | `STUDIO_NOTIFICATION_EMAILS` (Infra-Env, CSV) | Inline-HTML Report | Optional; Fehler nur als Warning |
| **Geplantes Kursende gesetzt** | `updateCourse` → `notifyParticipantsPlannedEndDate` | Alle `course.participants` | `buildPlannedEndDateMail` | Rollkurs `active` mit TN; Skip: `invited`, kein Profil |
| **Geplantes Kursende aufgehoben** | `updateCourse` → `notifyParticipantsPlannedEndDate` | Alle `course.participants` | `buildPlannedEndDateClearedMail` | wie oben |
| **Nachrücken Warteliste** | `processPromotions` | Nachgerückte Person | `buildWaitlistPromotionMail` + `.ics` | wie Tausch erfolgreich |
| **Termin freigegeben (Selbst)** | `updateOverride` | handelnde Person | `buildParticipantTermReleasedMail` | rechtzeitige Absage vor Cutoff; Hinweis Ersatztermin; **keine** Mail bei kurzfristiger Absage |
| **Tausch erfolgreich** | `createSwap` (→ `active`), `updateSwap` (→ `active`), `processRingSwaps` | Tauschende Person | `buildSwapSuccessMail` + `.ics`-Anhang | `SendRawEmail`; ICS `METHOD:PUBLISH` |
| **Kursbeitritt** | `updateCourse` | Neu hinzugefügte Stamm-TN | `buildCourseMembershipMail` | Nur bei `active`; nicht bei `draft`→`active` (dort Kurs-aktiv-Mail) |
| **Kurs aktiv (draft→active)** | `updateCourse` | Alle Stamm-TN | `buildCourseActivatedMail` | Einmalig bei Statuswechsel |
| **Trainer: Teilnehmerliste** | `updateCourse` | `course.instructors` | `buildInstructorParticipantListChangedMail` | Code vorhanden; **versendet erst**, wenn `instructors` am Kurs gesetzt — Bedarf/Leitung-Zuordnung noch klären |

### Template-Module

| Modul | Pfad |
|-------|------|
| Auth | `backend/src/lambdas/shared/templates/auth/authMailTemplates.ts` |
| Kurs | `backend/src/lambdas/shared/templates/course/courseMailTemplates.ts` |
| Tausch / Warteliste | `backend/src/lambdas/shared/templates/swap/swapMailTemplates.ts` |
| Geplantes Kursende (Versand) | `backend/src/lambdas/shared/plannedEndDateNotifications.ts` |
| Tausch + ICS (Versand) | `backend/src/lambdas/shared/notifications/swapSuccessNotification.ts` |
| Warteliste (Versand) | `backend/src/lambdas/shared/notifications/waitlistPromotionNotification.ts` |
| Kursbeitritt / Trainer (Versand) | `backend/src/lambdas/shared/notifications/courseMembershipNotifications.ts` |
| Termin-Absage / Freigabe (Versand) | `backend/src/lambdas/shared/notifications/termAbsenceNotifications.ts` |
| Termin-Absage (Templates) | `backend/src/lambdas/shared/templates/course/termMailTemplates.ts` |
| ICS | `backend/src/lambdas/shared/notifications/buildIcsPublishEvent.ts` |
| SES HTML / MIME | `backend/src/lambdas/shared/notifications/sendParticipantEmail.ts` |

### Hilfslogik

- **Profil + E-Mail auflösen:** `backend/src/lambdas/shared/participantEmailLookup.ts` (`resolveParticipantEmail`)
- **Locale:** `MAIL_LOCALE` (Default `de`)
- **Login-Links:** `BASE_URL`

### Vorhanden, aber ungenutzt

| Template | Status |
|----------|--------|
| `buildInvitePreparationMail` | Nur in Tests; kein Lambda-Versand |

### Bewusst **ohne** E-Mail

| Bereich | Flow | Anmerkung |
|---------|------|-----------|
| **Tauschanfrage** (`pending`) | `createSwap`, Gegenpartei wartet | zu viel Lärm für MVP; Digest später |
| **Tausch abgelehnt / zurückgezogen** | `deleteSwap`, Ablehnung | optional später |
| **Kurzfristige Absage (SN)** | `updateOverride` | Platz bleibt belegt — keine Bestätigungs-Mail |
| **Absage zurücknehmen (RC)** | `updateOverride` | keine Mail |
| **Entfernen aus Stammliste** | `updateCourse` `participants` | keine Mail |
| **Tenant-/Studio-Einstellungen** | `updateTenantSettings` | — |

---

## Produktentscheidungen (Stand Team)

### MVP-Priorität Teilnehmer:innen

| Prio | Ereignis | Inhalt | Trigger / Lambda | Status |
|------|----------|--------|------------------|--------|
| **1** | **Nachrücken von Warteliste** | Bestätigung mit Termin (HTML) + **ICS** | `processPromotions` | ✓ |
| **2** | **Tausch erfolgreich** | Bestätigung mit Zieltermin (HTML) + **ICS** | `createSwap` / `updateSwap` / `processRingSwaps` | ✓ |
| **3** | **Kursbeitritt** | Willkommen + Kursinfo + nächster/erster Termin (HTML) | `updateCourse` | ✓ |

**Nicht in MVP:** Tausch**anfragen** (eingehend/ausgehend) — potenziell zu viel Lärm; erst nach Erfahrung im Betrieb entscheiden.

### Kursbeitritt — wann mailen?

| Situation | Empfänger | Anmerkung |
|-----------|-----------|-----------|
| Person wird zu **`active`** Kurs in `course.participants` hinzugefügt | die hinzugefügte Person | Abgrenzung: Studio-**Einladung** (`createParticipants`) bleibt separat |
| Kurs wechselt **`draft` → `active`** | alle aktuell in `course.participants` | einmalige „Kurs ist live“-Mail; nicht bei jedem späteren Edit |

Keine Mail bei reinem Entfernen aus der Liste (dafür ggf. später separat).

### Trainer / Kursleitung

**Stand:** Technisch vorbereitet (`buildInstructorParticipantListChangedMail` bei Stamm-Änderung), aber **praktisch inaktiv** — Kursen ist meist noch keine Leitung (`course.instructors`) zugeordnet. Bedarf und Kanal (Einzelmail vs. Digest) zuerst im Betrieb klären; kein Blocker für MVP Teilnehmer:innen.

| Geplant / Code | Status |
|----------------|--------|
| Teilnehmerliste geändert (add/remove Stamm) | Code in `updateCourse`; Versand nur bei gesetzten `instructors` |
| Terminabsage im eigenen Kurs | nicht umgesetzt; heute nur Studio-Report bei `cancelCourseDate` |

| Bewusst nicht MVP | Grund |
|-------------------|--------|
| **Gäste** | meist selbst durch Leitung eingetragen |
| **Tauschanfragen** (jede Richtung) | zu granular; siehe Digest-Zukunft |
| **Einzelmail pro Kleinigkeit** | siehe Zukunftsplanung |

Zugeordnete Instructor:innen aus `course.instructors` (nicht ganzes Studio), sofern nicht anders konfiguriert.

Zugeordnete Instructor:innen aus `course.instructors` (nicht ganzes Studio), sofern aktiviert.

### Kalender-Anhang (ICS)

Kalender-Import ist **freiwillig** (Teilnehmer:in entscheidet). Absage-**Storno** per ICS (`METHOD:CANCEL`, stabile `UID`) ist **bewusst out of scope**.

| Anwendungsfall | ICS | Stand |
|----------------|-----|--------|
| Nachrücken Warteliste | `.ics` (`METHOD:PUBLISH`) | ✓ implementiert |
| Tausch erfolgreich | `.ics` (`METHOD:PUBLISH`) | ✓ implementiert |
| Kursbeitritt / Kurs aktiv | — | HTML only; Serien-ICS später |
| Terminabsage / Freigabe | — | HTML only |
| Storno / UPDATE in externem Kalender | — | out of scope |

**Technik (implementiert):**

- `buildIcsPublishEvent` — `UID` z. B. `{tenantId}/{courseId}/{date}@yogaswap`, `DTSTART`/`DTEND` aus `date` + `course.time`
- **`DTEND` / Kursdauer:** fest **90 Minuten** → Follow-up [#239](https://github.com/CurlyKarin/yogaswap/issues/239)
- `sendParticipantEmail` — `SendEmail` oder `SendRawEmail` (Multipart-MIME)
- IAM: `ses:SendRawEmail` für betroffene Lambdas in `main.tf`

**Hinweis:** `processPromotions` setzt den Swap auf `active` und sendet die **Nachrücken-Mail** (nicht die Tausch-erfolgreich-Vorlage). Ringtausch: je aktivierter Swap eine Mail an die jeweilige Person.

### Zukunftsplanung (nicht MVP)

- **Digest / Sammel-Updates** in festen Abständen, wenn es Änderungen gab (Tauschaktivität, Teilnehmerliste, …) — statt E-Mail bei jeder Kleinigkeit
- UI-Schalter Studio / persönlich (Architektur unten vorgesehen)
- Tausch**anfrage**-Mails, falls sich der Bedarf zeigt

---

## Lücken und Folgearbeit

### Teilnehmer:innen — MVP (#45) ✓

Alle MVP-Punkte oben sind umgesetzt. Manuelle Prüfung nach Deploy empfohlen (SES, `BASE_URL`, Profil mit E-Mail).

### Teilnehmer:innen — zurückgestellt

| Ereignis | Anmerkung |
|----------|-----------|
| Tauschanfrage eingegangen | zu viel für MVP |
| Tausch abgelehnt / zurückgezogen | optional später |
| Termin-Erinnerung | P3 |
| Serien-ICS beim Kursbeitritt | später |

### Trainer / Kursleitung — Folgearbeit

| Ereignis | Anmerkung |
|----------|-----------|
| Teilnehmerliste geändert | Code da; `instructors` pflegen + Bedarf klären |
| Terminabsage im eigenen Kurs | nur Studio-Report heute |
| Gäste, offene Tauschanfrage, SN an Leitung | Digest / später |

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
| **Tausch bestätigt / ausgeführt** | Beide Seiten brauchen Bestätigung | → MVP Stufe 1 HTML; ICS optional Stufe 2 |
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

### Zentrale Versand-Schicht

**Stand:** `backend/src/lambdas/shared/notifications/` mit `sendParticipantEmail`, `buildIcsPublishEvent` und ereignisspezifischen `notify*`-Helfern. Lambdas rufen diese direkt auf.

**Noch offen (Folge-Issue):**

1. **`NotificationEvent`** — enum/Union aller Ereignistypen
2. **`resolveNotificationEnabled(tenant, profile, event)`** — heute: immer senden außer hart codierte Skips (`invited`, fehlende E-Mail)
3. **`sendNotification({ event, … })`** — einheitlicher Einstieg statt verstreuter `SendEmailCommand` in älteren Lambdas

Vorteil: Schalter, Locale, Metriken und Templates an einer Stelle; `STUDIO_NOTIFICATION_EMAILS` kann später in `TenantSettings.studioNotificationEmails` wandern.

### Was in v1 trotzdem schon mitdenken

| Thema | Empfehlung |
|-------|------------|
| Neue Mail | `swapMailTemplates.ts` / `courseMailTemplates.ts`; Stufe 2: `buildIcsPublishEvent` + `sendRawEmailWithAttachment` |
| Empfängerliste | Immer über `resolveParticipantEmail`; Instructor:innen aus `course.instructors` |
| Fehler | Nicht-blockierend für Hauptaktion (wie heute bei `createParticipants` / `cancelCourseDate`) |
| Logging | Einheitliches JSON-Summary pro Versand |
| Tests | Template-Unit-Tests ✓; Lambda-Integration mit gemocktem SES optional |

---

## Offene Produktfragen

| # | Frage | Stand |
|---|--------|-------|
| 1 | Trainer:in — nur `course.instructors`? | **Ja** (Vorgabe MVP) |
| 2 | Tauschanfrage sofort mailen? | **Nein** für MVP; Digest später |
| 3 | Kursbeitritt — wann? | **Entschieden:** add zu active + draft→active |
| 4 | Studio-Report konfigurierbar? | offen (`STUDIO_NOTIFICATION_EMAILS` vs. Tenant) |
| 5 | Opt-out kursbezogene Mails? | Architektur ja; UI später |
| 6 | ICS bei Kursbeitritt Serienkurs | offen; Serien-ICS später |
| 7 | ICS bei Terminabsage (Storno)? | **Nein** — out of scope |
| 8 | ICS im MVP für neue Mails? | **Ja** — Nachrücken + Tausch erfolgreich mit `.ics`; Rest HTML |
| 9 | Kursdauer für ICS `DTEND`? | MVP: **90 Min fest**; pro Kurs → [#239](https://github.com/CurlyKarin/yogaswap/issues/239) |

---

## Nächste Schritte

### Erledigt (#45 MVP)

1. ~~Produktentscheidungen Teilnehmer MVP~~
2. ~~Nachrücken, Tausch erfolgreich, Kursbeitritt, Absage/Freigabe~~
3. ~~ICS-Helfer + `SendRawEmail`~~
4. ~~Deutsche Terminformatierung in Mails~~

### Folge-Issues (nicht #45)

1. **Deploy + manueller Testplan** (SES Sandbox, aktive Profile)
2. `TenantSettings.emailNotifications` + Resolver (ohne UI)
3. Kursleitung: Bedarf klären, `course.instructors` pflegen, ggf. Digest
4. [#239](https://github.com/CurlyKarin/yogaswap/issues/239) — Kursdauer für ICS `DTEND`
5. Zentrales `sendNotification` / Migration älterer Auth-Mails
6. UI-Opt-out, Tauschanfrage-Mails, Erinnerungen

## Verwandte Doku

- `docs/short-notice-cancellation.md` — Kurzfrist-Absage (ohne Mail)
- `docs/course-views.md` — Tausch-UI
- `README.md` — SES-Einrichtung, Sandbox
