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

## Wichtigste Lücken (Vorschlag Priorität)

Bewertung für eine **erste nutzbare Version** (#45): hoher Nutzen, klarer Trigger, wenig Mehrdeutigkeit.

### Teilnehmer:innen (P1)

| Ereignis | Warum wichtig | Anmerkung |
|----------|---------------|-----------|
| **Tauschanfrage eingegangen** | Gegenpartei muss reagieren | Heute nur in-app sichtbar |
| **Tausch bestätigt / ausgeführt** | Beide Seiten brauchen Bestätigung | inkl. Ringtausch-Beteiligte |
| **Tausch abgelehnt / zurückgezogen** | Erwartungsmanagement | |
| **Nachrücken von Warteliste** | `processPromotions` — Platz wurde frei | Zeitkritisch |
| **Neuer Kurs / Kursbeitritt** | Aufnahme in `course.participants` ohne separate Einladung | Abgrenzung zu Studio-Einladung |

### Trainer / Kursleitung (P1)

| Ereignis | Warum wichtig | Anmerkung |
|----------|---------------|-----------|
| **Terminabsage im eigenen Kurs** | Studio-Report existiert, aber nicht an zugeordnete Instructor:innen | Empfänger aus `course.instructors` |
| **Offene Tauschanfrage am Kurs** | Übersicht für Leitung | Optional Digest statt Einzelmail |
| **Kurzfristige Absage (SN)** | Siehe `docs/short-notice-cancellation.md` | Heute keine Mail |

### Studio / Admin (P2)

| Ereignis | Anmerkung |
|----------|-----------|
| **Tausch-Aktivität (Digest)** | Alternative zu vielen Einzelmails |
| **Kurs ohne Leitung / Kapazitätsengpass** | Eher Reporting als Push |

### Später (P3)

- Gastplätze hinzugefügt/entfernt
- Kursplan-Fenster geändert (viele Empfänger → eher Digest)
- Erinnerung vor Termin (Reminder)
- Inaktiv-/Nachlauf-Hinweise

---

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

  swapRequestReceived?: boolean;
  swapOutcome?: boolean; // bestätigt, abgelehnt, zurückgezogen
  waitlistPromotion?: boolean;
  courseMembershipChanged?: boolean;
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
  swapOutcome?: boolean;
  waitlistPromotion?: boolean;
  courseMembershipChanged?: boolean;
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
| Neue Mail | Template in `authMailTemplates` oder `courseMailTemplates` (oder neues `swapMailTemplates.ts`) |
| Empfängerliste | Immer über `resolveParticipantEmail`; Instructor:innen aus `course.instructors` |
| Fehler | Nicht-blockierend für Hauptaktion (wie heute bei `createParticipants` / `cancelCourseDate`) |
| Logging | Einheitliches JSON-Summary pro Versand |
| Tests | Template-Unit-Tests + Lambda-Integration mit gemocktem SES |

---

## Offene Produktfragen (#45)

1. **Trainer:in** — nur zugeordnete Instructor:innen des Kurses oder alle Instructor:innen des Studios?
2. **Tausch** — Gegenpartei immer sofort mailen oder nur bei Inaktivität / Digest?
3. **Kursbeitritt** — Mail bei jeder `participants`-Änderung oder nur Erstaufnahme?
4. **Studio-Report** — `STUDIO_NOTIFICATION_EMAILS` (Deploy-Env) vs. konfigurierbar pro Tenant in den Studioeinstellungen?
5. **Opt-out** — Teilnehmer dürfen kursbezogene Mails abschalten, Auth-Mails nie?

---

## Nächste Schritte (Vorschlag)

1. Produktentscheid zu P1-Ereignissen (Tabelle oben)
2. `sendNotification`-Gerüst + `NotificationEvent` (ohne UI-Schalter)
3. Erste Mails: Tauschanfrage + Tausch-Ergebnis + Warteliste
4. Instructor-Mails bei Terminabsage
5. `TenantSettings.emailNotifications` als Typ + Resolver (Defaults = heutiges Verhalten)
6. UI-Schalter Studio / persönlich in separatem Issue

## Verwandte Doku

- `docs/short-notice-cancellation.md` — Kurzfrist-Absage (ohne Mail)
- `docs/course-views.md` — Tausch-UI
- `README.md` — SES-Einrichtung, Sandbox
