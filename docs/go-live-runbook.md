# Go-Live-Runbook: erstes Studio (#104)

Pragmatisches Runbook für den Pilot-Rollout eines realen Studios.
Ziel: Launch **reproduzierbar** und mit klarem Go/No-Go, Smoke, Monitoring und Rollback.

Parent: [#101](https://github.com/CurlyKarin/yogaswap/issues/101) · Ticket: [#104](https://github.com/CurlyKarin/yogaswap/issues/104)

## Verwandte Doku (nicht duplizieren)

| Thema | Dokument |
|---|---|
| Deploy (CI / lokal) | [`github-actions-deploy.md`](./github-actions-deploy.md) |
| Subdomain ↔ Tenant | [`tenant-host.md`](./tenant-host.md) |
| SES Production / Bounce | [`ses-production.md`](./ses-production.md) |
| Auth-/Code-Mail-QA | [`cognito-mail-qa.md`](./cognito-mail-qa.md) |
| E-Mail-Inventar | [`email-notifications.md`](./email-notifications.md) |
| Remote State | [`opentofu-remote-state.md`](./opentofu-remote-state.md) |
| Studio anlegen (Make) | `projects/yogaswap/Makefile` (`create-tenant`, `bootstrap-admin`) |

## Umgebungen (Kurz)

| Env | Workspace | Typische URL | Deploy |
|---|---|---|---|
| Staging | `staging` | Staging-Host / Test-Subdomain | Auto nach Merge `main` + manuell |
| Demo | `default` | `demo.yogaswap.de` | Nur manuell |
| Prod | `prod` | `app.yogaswap.de`, `{tenant}.app.yogaswap.de` | Nur manuell |

---

## 1. Rollen und Kontakt

Pilot = kleines Team; eine Person kann mehrere Rollen tragen.

| Rolle | Aufgabe | Wer (Pilot) |
|---|---|---|
| **Release Owner** | Go/No-Go, Deploy-Freigabe, Abbruch | ________________ |
| **Ops** | Deploy, Logs, SES/CloudWatch, Rollback | ________________ |
| **Studio-Kontakt** | Fachliche Freigabe, Testpersonen, Eskalation Studio | ________________ |
| **Support-Fallback** | Wenn Mail fehlt: manuelles Passwort / Messenger | ________________ |

**Kontaktwege am Rollout-Tag**

- Chat / Telefon Release Owner ↔ Studio-Kontakt: ________________
- Support-Mail / Alias (falls aktiv): siehe [`support-email-alias.md`](./support-email-alias.md)
- Bei SES-Ausfall: AdminPanel `emailSent=false` → Temp-Passwort manuell (siehe [`ses-production.md`](./ses-production.md) Support-Fallback)

---

## 2. Zeitslots (Vorlage Rollout-Tag)

Zeiten anpassen; Puffer einplanen.

| Slot | Uhrzeit | Inhalt |
|---|---|---|
| T−1 | Vortag | Go/No-Go vorbereiten, Staging-Dry-Run abgeschlossen, Prod-Branch = `main` |
| T0 | ____ | Kickoff (5 Min): Go-Kriterien kurz bestätigen |
| T1 | ____ | Prod-Deploy (Actions **Deploy Prod** oder lokal `make deploy ENV=prod`) |
| T2 | ____ | Smoke Prod (Abschnitt 4) — Apex + Studio-Subdomain |
| T3 | ____ | Studio-Admin einladen / Login verifizieren |
| T4 | ____ | Erste echte Einladung an Studio-Person |
| T5 | ____ | 30–60 Min Beobachtung (Mails, Logs, SES) |
| T6 | ____ | Go-Live-Bestätigung oder Rollback-Entscheidung |

Abbruchkriterium: Release Owner sagt **No-Go** oder Rollback (Abschnitt 6).

---

## 3. Go / No-Go-Checkliste

Alles muss für **Go** erfüllt sein. No-Go → kein Prod-Deploy bzw. Stop.

### 3.1 Technisch

- [ ] `main` grün (CI); kein kritischer offener Hotfix für Auth/Invite/Tenant
- [ ] Staging-Dry-Run (Abschnitt 5) erfolgreich und notiert
- [ ] SES Production Access aktiv (`ProductionAccessEnabled=true`) — [`ses-production.md`](./ses-production.md)
- [ ] Domain/DKIM/SPF/DMARC ok (kurz prüfen oder letzter bekannter Stand)
- [ ] Deploy-Secrets/Environments in GitHub vorhanden ([`github-actions-deploy.md`](./github-actions-deploy.md))
- [ ] Cognito/Auth-Mail-Strecke freigegeben ([`cognito-mail-qa.md`](./cognito-mail-qa.md))
- [ ] Unbekannte Subdomain zeigt „Studio nicht gefunden“ ([`tenant-host.md`](./tenant-host.md))
- [ ] Demo-Login in Prod aus ([#100](https://github.com/CurlyKarin/yogaswap/issues/100) / Build-Flag)
- [ ] Tenant-Anlegen-Weg klar: `make create-tenant ENV=prod TENANT=<id> ADMIN=<nick>` (Admin existiert in Cognito)

### 3.2 Fachlich

- [ ] Studio-`tenantId` / Anzeigename final (DNS-Label = Subdomain, z. B. `beharmony`)
- [ ] Studio-Admin-Nickname + E-Mail bekannt
- [ ] Mindestens eine Testperson mit erreichbarer Mail (nicht nur Spam-Ordner)
- [ ] Studio weiß: Absender `YogaSwap <noreply@yogaswap.de>`, Betreff oft `{Studio}: …`
- [ ] Erwartung „Pilot“ kommuniziert (kleine Nutzerzahl, Feedback-Kanal)

### 3.3 Betriebsbereitschaft

- [ ] Wer schaut CloudWatch / SES am Tag (Ops)?
- [ ] Rollback-Schwelle verstanden (Abschnitt 6)
- [ ] Support-Fallback bei fehlender Mail geübt oder dokumentiert

**Entscheidung:** Go ☐ / No-Go ☐ · Datum: ________ · Release Owner: ________

---

## 4. Smoke-Test (Skript)

Umgebung ankreuzen: Staging ☐ · Demo ☐ · Prod ☐  
Basis-URL Studio: `https://________.app.yogaswap.de` (oder Staging-Äquivalent)  
Apex / Default: `https://app.yogaswap.de` bzw. Staging-Apex

### 4.1 Host / Tenant

| # | Schritt | Erwartung | OK |
|---|---|---|---|
| H1 | Unbekannte Subdomain öffnen | „Studio nicht gefunden“, kein Login | ☐ |
| H2 | Bekanntes Studio öffnen | Login / App lädt, korrektes Studio | ☐ |
| H3 | Apex (falls Prod) | `default-tenant` bzw. erwartetes Default-Studio | ☐ |

### 4.2 Login & Rollen

| # | Schritt | Erwartung | OK |
|---|---|---|---|
| L1 | Admin-Login (Studio-Subdomain) | Session ok, Admin-UI sichtbar | ☐ |
| L2 | Teilnehmer-Login (falls vorhanden) | Keine Admin-Aktionen | ☐ |

### 4.3 Teilnehmer / Invite / Reset / Mail

| # | Schritt | Erwartung | OK |
|---|---|---|---|
| P1 | Teilnehmer anlegen **ohne** E-Mail | Profil/Membership ok, keine SES-Pflicht | ☐ |
| P2 | Teilnehmer **mit** neuer E-Mail einladen | `emailSent=true` (oder dokumentierter Fallback) | ☐ |
| P3 | Invite-Mail | Betreff mit Studio-Namen (falls gesetzt), Absender YogaSwap/`noreply@` | ☐ |
| P4 | Link → Passwort → Code-Mail | Code kommt, Login gelingt | ☐ |
| P5 | Admin: Passwort zurücksetzen | Recovery-Mail + Code-Flow ok | ☐ |
| P6 | Optional: Self-Service Passwort-Reset | Mail + Flow ok | ☐ |

Detail-Checks Auth-Mails: [`cognito-mail-qa.md`](./cognito-mail-qa.md).  
Bei Spam: „Kein Spam“ + Notiz (Provider); Domain-Reputation kann frisch sein.

### 4.4 Kernfunktionen (kurz)

| # | Schritt | Erwartung | OK |
|---|---|---|---|
| C1 | Kursliste sichtbar (aktive Kurse) | Kein leerer Fehlerzustand | ☐ |
| C2 | Optional: eine Buchung / ein Tausch-Smoke | Happy Path oder bewusst skippen und notieren | ☐ |

### 4.5 Logs / SES (Minimum)

| # | Schritt | Erwartung | OK |
|---|---|---|---|
| M1 | CloudWatch Lambda `*-create-participants` | Kein wiederholter SES-Send-Fehler | ☐ |
| M2 | SES Metrics (Send/Bounce/Complaint) kurz ansehen | Keine Complaint-Spitze; Bounce im Rahmen | ☐ |

**Smoke-Ergebnis:** Pass ☐ / Fail ☐ · Notizen: ________

---

## 5. Staging-Dry-Run (Akzeptanz #104)

Vor dem echten Prod-Go-Live **mindestens einmal** durchspielen.

1. Staging auf aktuellem `main` (Auto-Deploy oder `make deploy ENV=staging`).
2. Abschnitt 3 (Go/No-Go) fachlich/technisch für Staging abhaken, soweit sinnvoll.
3. Abschnitt 4 vollständig auf Staging (ggf. temporären Test-Tenant per `create-tenant`).
4. Ergebnis hier dokumentieren:

| Feld | Wert |
|---|---|
| Datum | ________ |
| `main` SHA / Deploy | ________ |
| Tenant / URL | ________ |
| Smoke Pass/Fail | ________ |
| Offene Punkte | ________ |
| Durchgeführt von | ________ |

Dry-Run gilt als erfüllt, wenn Smoke **Pass** (oder Fail mit dokumentiertem, behobenem Blocker und Wiederholung).

---

## 6. Rollback-Plan

### 6.1 Wann

- Kritischer Auth-/Invite-Ausfall in Prod
- Falscher Tenant / Datenkorruption sichtbar für Studio
- SES massenhaft Bounce/Complaint oder Totalausfall Versand
- Release Owner entscheidet Abbruch

### 6.2 Was (abgestuft)

| Stufe | Maßnahme | Wer |
|---|---|---|
| **Soft** | Kein weiterer Prod-Deploy; Studio informieren; Support-Fallback (manuelle Passwörter) | Ops + Studio-Kontakt |
| **App** | Letzten bekannten guten Stand erneut deployen (vorheriger `main`-Commit / Redeploy) | Ops |
| **Tenant** | Betroffenes Studio: Zugang sperren / Memberships bereinigen; Subdomain zeigt weiter SPA, Tenant löschen → „Studio nicht gefunden“ ([`tenant-host.md`](./tenant-host.md)) | Ops |
| **Auth-Mail** | Cognito Custom Message Soft-Rollback — [`cognito-mail-qa.md`](./cognito-mail-qa.md) Abschnitt Rollback | Ops |
| **Infra** | Gezieltes `tofu` nur mit Plan und Freigabe; State-Locks beachten ([`opentofu-remote-state.md`](./opentofu-remote-state.md)) | Ops |

### 6.3 Nach Rollback

- [ ] Smoke H2/L1 und Invite erneut (oder bewusst „Studio offline“)
- [ ] Kurzpost-Mortem: Ursache, Dauer, Follow-up-Issue
- [ ] Studio-Kontakt informiert

---

## 7. Monitoring / Alarming (Minimum Pilot)

Kein schweres Alarming nötig für den ersten Pilot; **manuell** reicht.

| Signal | Wo | Aktion |
|---|---|---|
| Lambda-Fehler Invite/Reset | CloudWatch Logs `*-create-participants`, `*-reset-*` | Support-Fallback; Fix + Redeploy |
| SES Bounce/Complaint | CloudWatch Metrics `AWS/SES` | Empfänger prüfen; Suppression beachten |
| 5xx API / CloudFront | CloudWatch / Browser-Netzwerk | Deploy/Logs prüfen |
| Nutzer-Feedback „keine Mail“ | Studio-Kontakt | Spam, Support-Fallback, Logs |

Spätere Alarme (Post-Pilot): z. B. Bounce ≫ 5 %, Complaint ≫ 0,1 % — siehe [`ses-production.md`](./ses-production.md).

**Fehlerbudget (Pilot):** kurze Störungen ok, wenn Support-Fallback greift und Studio informiert ist. Kein 24/7-On-Call.

---

## 8. Studio anlegen (Prod-Kurzcheckliste)

Wenn das Studio noch nicht existiert:

```bash
# Admin muss in Cognito der Env existieren (sonst zuerst bootstrap / createAdminUser)
make -C projects/yogaswap create-tenant ENV=prod TENANT=<tenantId> ADMIN=<nickname> \
  ARGS='--name "<Anzeigename>"'
```

- Subdomain: `https://<tenantId>.app.yogaswap.de`
- Admin-Membership + Participant-Profil werden standardmäßig gesetzt
- Details: [`tenant-host.md`](./tenant-host.md), Makefile-Kommentar `create-tenant`

---

## 9. Abschluss Go-Live

- [ ] Smoke Prod Pass
- [ ] Studio-Admin kann einladen
- [ ] Mindestens eine reale Einladung zugestellt (oder dokumentierter Fallback)
- [ ] 30–60 Min Beobachtung ohne kritischen Vorfall
- [ ] Runbook-Felder (Rollen, Zeiten, Dry-Run) ausgefüllt

**Go-Live bestätigt:** Datum ________ · Release Owner ________

Issue [#104](https://github.com/CurlyKarin/yogaswap/issues/104): nach Dry-Run + Dokument-Durchspiel schließen; Parent [#101](https://github.com/CurlyKarin/yogaswap/issues/101) danach prüfen.
