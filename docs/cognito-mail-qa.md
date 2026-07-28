# QA-Checkliste: Cognito- / Auth-Mails (#109)

Inhaltliche und operative Abnahme der Cognito-Code-Mails (und zugehöriger App-Auth-Mails) vor Rollout.

- **Parent:** [#87](https://github.com/CurlyKarin/yogaswap/issues/87)
- **Ticket:** [#109](https://github.com/CurlyKarin/yogaswap/issues/109)
- **Voraussetzungen:** [#80](https://github.com/CurlyKarin/yogaswap/issues/80) SES Production, [#106](https://github.com/CurlyKarin/yogaswap/issues/106) SES/DEVELOPER Absender, [#107](https://github.com/CurlyKarin/yogaswap/issues/107)/[#108](https://github.com/CurlyKarin/yogaswap/issues/108) Custom Message DE
- **Technik-Runbook:** [ses-production.md](./ses-production.md)

---

## Abgrenzung

| Hier (#109) | Nicht hier |
|---|---|
| Absender, Sprache, Platzhalter, Lesbarkeit der **Auth-/Code-Mails** | Alias-Postfächer `support@` / Impressum-Texte (Rest #87) |
| Smoke + Freigabe Go-Live Mailzustellung | i18n Mehrsprachigkeit (#95) |
| Rollback Cognito Custom Message | Kurs-/Tausch-Benachrichtigungen (#45) — eigener Check |

---

## Erwartete Absender / Betreffzeilen

| Mail | Versand | From | Subject (DE) |
|---|---|---|---|
| Einladung (Link) | App SES `createParticipants` | `YogaSwap <noreply@yogaswap.de>` | `YogaSwap Einladung` |
| Passwort-Reset Admin/Self (Link) | App SES | `YogaSwap <noreply@yogaswap.de>` | `YogaSwap Passwort zuruecksetzen` |
| **Bestaetigungscode** | Cognito + Custom Message | `YogaSwap <noreply@yogaswap.de>` | `YogaSwap Bestaetigungscode` |

Code-Mail-Body muss den **ersetzten Code** enthalten (Cognito ersetzt `{####}`).

---

## A — Checkliste (pro Testlauf)

Umgebung: Demo / Staging / Prod — bitte ankreuzen.

### A1 Absender & Zustellung

- [ ] From-Anzeige: **YogaSwap**
- [ ] From-Adresse: `noreply@yogaswap.de` (nicht `verificationemail.com`)
- [ ] Zustellung Posteingang (nicht Spam) — zumindest typische Provider
- [ ] Bei Spam: „Kein Spam“ markieren und Notiz (Provider/Konto)

### A2 Sprache & Inhalt (Code-Mail)

- [ ] Betreff deutsch: `YogaSwap Bestaetigungscode`
- [ ] Anrede mit Spitzname / Nickname
- [ ] Hinweis „Bestaetigungscode“ / Code eingeben
- [ ] Code sichtbar und in der App akzeptiert
- [ ] Kein englischer Cognito-Standardtext

### A3 Platzhalter / Fehlerfälle

- [ ] Code ist eine konkrete Ziffernfolge (kein sichtbares `{####}`)
- [ ] Unbekannte/ignorierte Trigger ändern nichts am Flow
- [ ] Erneuter Admin-Reset sendet erneut brauchbaren Code

### A4 Lesbarkeit

- [ ] HTML lesbar in Gmail / web.de / IONOS o. Ä.
- [ ] Mobile Lesbarkeit ok (Code hervorstechend)
- [ ] Keine abgeschnittenen Links in der **Link-Mail** davor

---

## B — Testfälle

### B1 Neu angelegte Person (Invite)

1. AdminPanel → Teilnehmer:in mit **neuer, unverifizierter** E-Mail einladen  
2. Link-Mail öffnen → Passwort setzen → Code-Mail  
3. Code eingeben → Login möglich  

### B2 Bestehende Person (Admin-Passwort-Reset)

1. AdminPanel → Passwort zurücksetzen  
2. Link-Mail → neues Passwort → Code-Mail  
3. Code + Login  

### B3 Self-Service „Passwort vergessen“

1. Login → Passwort vergessen (bekannter Nickname)  
2. Link-Mail → Flow wie B2  

### B4 Bestehende Person, andere Mailbox (Stichprobe)

Gleicher Flow wie B2 an zweitem Provider (z. B. Gmail + web.de).

---

## C — Testergebnisse (Stand 2026-07-27/28)

| Fall | Env | Ergebnis | Notiz |
|---|---|---|---|
| Invite + Code (unverifizierte Adresse) | Demo / Prod-Stack | ok | SES Production Access; Absender Domain |
| Admin-Reset Link-Mail | Demo | ok / gemischt Spam | je nach Empfänger-Konto; SPF/DMARC gesetzt |
| Cognito-Code-Mail (Custom Message DE) | Demo (+ Staging/Prod deployed) | **ok** | nicht mehr dauerhaft Spam; **Gmail Posteingang** bestätigt |
| Absender Display-Name `YogaSwap` | alle Envs | ok | App + Cognito einheitlich |

Offene Restrisiken (akzeptiert für Pilot):

- Einzelne Provider können Link-Mails mit „Passwort zurücksetzen“ noch als Spam einstufen (Inhalt, nicht Absender).
- Neue Domain-Reputation baut sich über Zeit weiter auf.

---

## D — Freigabekriterien

Rollout der Cognito-/Auth-Mail-Zustellung ist freigegeben, wenn:

1. [x] #106 Absender SES/DEVELOPER live  
2. [x] #107/#108 Custom Message DE live (demo/staging/prod)  
3. [x] Checkliste A an Demo mit Code-Mail bestanden (inkl. Gmail)  
4. [x] Kein Blocker: Code-Mails dauerhaft im Spam bei typischen Adressen  
5. [x] Rollback-Weg dokumentiert (unten)

**Freigabe:** erteilt 2026-07-28 für Pilot/Go-Live der Auth-Mail-Strecke (Cognito-Code + SES-Absender), basierend auf Demo-Smoke und Gmail-Zustellung.  
Verantwortlich: Product Owner (Karin).

---

## E — Rollback

Wenn Code-Mails wieder Englisch/Spam/fehlerhaft sind:

1. **Soft:** In `projects/yogaswap/cognito.tf` den Block `lambda_config { custom_message = … }` entfernen bzw. auskommentieren, `tofu apply` je Workspace → Cognito fällt auf Standardtexte zurück (Absender bleibt SES/#106).  
2. **Härter:** Custom-Message-Lambda + Permission entfernen (nach Soft-Rollback).  
3. **Absender:** `email_configuration` auf `COGNITO_DEFAULT` zurücksetzen nur im Notfall (wieder `verificationemail.com` — vermeiden).  
4. Support-Fallback bei `emailSent=false`: siehe [ses-production.md](./ses-production.md) (tempPassword manuell).

Smoke nach Rollback: Admin-Reset → Code-Mail-Inhalt prüfen.

---

## Wiederholung vor Studio-Go-Live

Kurz vor erstem realen Studio noch einmal **B1 + B2** auf **Prod** gegen die Studio-Admin-Mailbox und eine externe Testadresse durchspielen; Ergebnisse hier oder im Ticket #109 ergänzen.
