# Chronologie: Marke / Domain YogaSwap und Pilot-Studio beharmony

**Zweck:** Übersicht für Markenanmeldung bzw. Anwaltsgespräch — wann der Name und die Domains betrieblich genutzt wurden.  
**Stand der Auswertung:** 2026-11-20  
**Quellen:** Git-Historie, GitHub-Issues/PRs, Repo-Dokumentation, DENIC-Whois, Bestätigungsmail Domain-Registrierung (Inhaberin).

---

## Kurzüberblick

| Meilenstein | Datum (belegt) | Ticket / PR | Kurz |
|---|---|---|---|
| Produktname „YogaSwap“ im Repo | **2025-08-14** | Initial Commit | Erste Codebasis |
| Demo-Stack (AWS/Code, noch ohne feste Custom-Domain) | **2025-09-12** | Commit „create demo“ | Frühe Demo-Umgebung |
| Domain `yogaswap.de` in App-Mails/Links (vor Registrierung geplant) | **2025-11-05** | Commit Cognito/Invite | Absender/Link bereits als `yogaswap.de` vorgesehen |
| **Domain `yogaswap.de` registriert** | **2026-03-12, 11:57** | Bestätigungsmail IONOS/DENIC | Inhaberin: Karin Schrader |
| Whois „Changed“; README-Link `app.yogaswap.de` | **2026-03-12** | Whois + README-Commit | Domain aktiv bei IONOS (ui-dns) |
| Staging `staging.yogaswap.de` | **2026-06-29** | [#102](https://github.com/CurlyKarin/yogaswap/issues/102) / [PR #244](https://github.com/CurlyKarin/yogaswap/pull/244) | Pre-Release-Umgebung |
| Prod-Apex `app.yogaswap.de` | **2026-07-01** | [#248](https://github.com/CurlyKarin/yogaswap/issues/248) / [PR #254](https://github.com/CurlyKarin/yogaswap/pull/254) | Produktions-Stack |
| Demo-Hostname `demo.yogaswap.de` | **2026-07-01** | [#253](https://github.com/CurlyKarin/yogaswap/issues/253) / [PR #255](https://github.com/CurlyKarin/yogaswap/pull/255) | Dedizierte Demo-URL |
| Studio-Subdomains `*.app.yogaswap.de` | **2026-07-22** | [#249](https://github.com/CurlyKarin/yogaswap/issues/249) / [PR #260](https://github.com/CurlyKarin/yogaswap/pull/260) | Multi-Tenant-URLs |
| SES/Domain-Mail `noreply@yogaswap.de` | **2026-07-24** | [#80](https://github.com/CurlyKarin/yogaswap/issues/80) / [PR #265](https://github.com/CurlyKarin/yogaswap/pull/265) | Versand unter Marken-Domain |
| Kontakt-Alias `support@yogaswap.de` | **2026-07-28** | [#87](https://github.com/CurlyKarin/yogaswap/issues/87) | Impressum/Support |
| **beharmony** live (`beharmony.app.yogaswap.de`) | **2026-07-30** | [#261](https://github.com/CurlyKarin/yogaswap/issues/261) / [PR #282](https://github.com/CurlyKarin/yogaswap/pull/282) | Erstes reales Studio |
| Rollout-Umbrella abgeschlossen | **2026-08-03** | [#101](https://github.com/CurlyKarin/yogaswap/issues/101) | Environments + Pilot bestätigt |
| Staging-Dry-Run (Go-Live-Runbook) Pass | **2026-08-03** | [#104](https://github.com/CurlyKarin/yogaswap/issues/104) | Formaler Smoke vor/bei Pilot |

---

## 1. Markenname „YogaSwap“

| Datum | Ereignis | Beleg |
|---|---|---|
| 2025-08-14 | Repository-Start, Produktname YogaSwap | Git: Initial Commit / „First Version from KI“ |
| fortlaufend | Öffentliche Nutzung des Namens in UI, Mails, Impressum, Domains | App, SES-Absender „YogaSwap &lt;noreply@yogaswap.de&gt;“, Docs |

Öffentliche Marketing-Landingpage unter Apex `yogaswap.de` ist **noch nicht** umgesetzt (offenes Ticket [#365](https://github.com/CurlyKarin/yogaswap/issues/365)). Betriebliche Nutzung läuft über App-/Demo-/Staging-Hosts und E-Mail.

---

## 2. Domain `yogaswap.de`

| Datum | Ereignis | Beleg |
|---|---|---|
| 2025-11-05 | Domain erscheint in Invite-Links / Absender im Code (`https://yogaswap.de/…`, `no-reply@yogaswap.de`) — zu diesem Zeitpunkt noch **nicht** registriert, aber bereits vorgesehen | Git-Commit Cognito/Invite |
| **2026-03-12, 11:57 Uhr** | **Registrierung von `yogaswap.de` per E-Mail bestätigt** | Bestätigungsmail der Registrierung |
| 2026-03-12 | **Inhaberin:** Karin Schrader | Angabe der Inhaberin (2026-11-20) |
| 2026-03-12 | DENIC-Whois: Domain **ACTIVE**, Nameserver IONOS (`ui-dns.*`); Feld **Changed** = 2026-03-12 11:56:50+01:00 (passt zur Bestätigungsmail) | `whois yogaswap.de` (Abfrage 2026-11-20) |
| 2026-03-12 | README verlinkt Live-Demo auf `https://app.yogaswap.de` | Git-Commit README |
| 2026-07-24 | SES Domain-Identity / DKIM / Doku für `noreply@yogaswap.de` | [#80](https://github.com/CurlyKarin/yogaswap/issues/80), [PR #265](https://github.com/CurlyKarin/yogaswap/pull/265), `docs/ses-production.md` |
| 2026-07-28 | Weiterleitung `support@yogaswap.de` bei IONOS dokumentiert | [#87](https://github.com/CurlyKarin/yogaswap/issues/87), `docs/support-email-alias.md` |

---

## 3. Demo

Zwei Stufen unterscheiden:

### 3.1 Frühe Demo-Umgebung (ohne feste Marken-Subdomain)

| Datum | Ereignis | Beleg |
|---|---|---|
| 2025-09-12 | Demo-Struktur / Deploy-Pfad im Repo | Git-Commit „create demo“ |
| 2025–2026 | Demo-Stack historisch oft unter Präfix `yogaswap-demo` / Workspace `default` | [#74](https://github.com/CurlyKarin/yogaswap/issues/74), [#248](https://github.com/CurlyKarin/yogaswap/issues/248) |

Erreichbarkeit damals typischerweise über **CloudFront-Default-URL**, nicht zwingend über `demo.yogaswap.de`.

### 3.2 Dedizierte Demo-URL

| Datum | Ereignis | Beleg |
|---|---|---|
| **2026-07-01** | `demo.yogaswap.de` aktiviert; Build-Modus `--mode demo` | [#253](https://github.com/CurlyKarin/yogaswap/issues/253), [PR #255](https://github.com/CurlyKarin/yogaswap/pull/255) (merged 2026-07-01) |

Aktuell: Demo = Workspace `default`, URL `https://demo.yogaswap.de` (siehe `docs/go-live-runbook.md`).

---

## 4. Staging

| Datum | Ereignis | Beleg |
|---|---|---|
| Ticket angelegt | 2026-04-09 | [#102](https://github.com/CurlyKarin/yogaswap/issues/102) |
| **2026-06-29** | Separater Staging-Stack + `staging.yogaswap.de` live im Sinne „deploybar/erreichbar“ | [PR #244](https://github.com/CurlyKarin/yogaswap/pull/244) merged 2026-06-29; Issue #102 closed |
| 2026-07-29 | CI/CD: automatisches Staging-Deploy nach Merge | [#15](https://github.com/CurlyKarin/yogaswap/issues/15) |
| 2026-08-03 | Staging-Dry-Run laut Go-Live-Runbook: **Pass** | [#104](https://github.com/CurlyKarin/yogaswap/issues/104), Runbook-Eintrag Datum 2026-08-03 |

URL: `https://staging.yogaswap.de`

---

## 5. App / Produktion (`app.yogaswap.de`)

| Datum | Ereignis | Beleg |
|---|---|---|
| Ticket / Planung | ab 2026-03 (Subdomains) bzw. 2026-06-30 | [#61](https://github.com/CurlyKarin/yogaswap/issues/61), [#248](https://github.com/CurlyKarin/yogaswap/issues/248) |
| **2026-07-01** | Frischer Prod-Stack `yogaswap-prod`, DNS-Cutover auf **`app.yogaswap.de`** | [PR #254](https://github.com/CurlyKarin/yogaswap/pull/254) merged 2026-07-01; #248 closed |
| **2026-07-22** | Wildcard `*.app.yogaswap.de` für Studio-Subdomains | [#249](https://github.com/CurlyKarin/yogaswap/issues/249), [PR #260](https://github.com/CurlyKarin/yogaswap/pull/260) |

Produktregel (dokumentiert):  
- `app.yogaswap.de` = Apex / Fallback (`default-tenant`), kein konkretes Studio  
- `{studio}.app.yogaswap.de` = Studio-Tenant  

Siehe `docs/tenant-host.md`.

---

## 6. Pilot-Studio beharmony online

| Datum | Ereignis | Beleg |
|---|---|---|
| Vorbereitung Subdomains | 2026-07-22 | [#249](https://github.com/CurlyKarin/yogaswap/issues/249) |
| **2026-07-30** | Erstes echtes Studio **beharmony** angelegt und live; Issue-Abschluss „beharmony ist live“ | [#261](https://github.com/CurlyKarin/yogaswap/issues/261) closed 2026-07-30; [PR #282](https://github.com/CurlyKarin/yogaswap/pull/282) merged 2026-07-30 |
| URL | | `https://beharmony.app.yogaswap.de` |
| 2026-07-30 | Hinweis: erste Invite-Mails teils Spam (frische Domain-Reputation); Infra DKIM/SPF/DMARC ok | Kommentar in #261 |
| 2026-08-03 | Rollout-Parent [#101](https://github.com/CurlyKarin/yogaswap/issues/101) geschlossen: „Pilot **beharmony** live“ | Issue-Abschlusskommentar |

**Go-Live-Rahmen:** Umbrella [#101](https://github.com/CurlyKarin/yogaswap/issues/101) („Rollout erstes Studio: Environments, Domains, Flags und Go-Live“), operatives Runbook [#104](https://github.com/CurlyKarin/yogaswap/issues/104) / `docs/go-live-runbook.md`.

---

## 7. Verwandte Tickets (Cluster)

| Ticket | Titel | Relevanz |
|---|---|---|
| [#101](https://github.com/CurlyKarin/yogaswap/issues/101) | Rollout erstes Studio (Umbrella) | Gesamt-DoD Environments + Pilot |
| [#102](https://github.com/CurlyKarin/yogaswap/issues/102) | Staging-Umgebung | `staging.yogaswap.de` |
| [#248](https://github.com/CurlyKarin/yogaswap/issues/248) | prod-Stack `yogaswap-prod` | `app.yogaswap.de` |
| [#253](https://github.com/CurlyKarin/yogaswap/issues/253) | Demo-Build / Hostname | `demo.yogaswap.de` |
| [#249](https://github.com/CurlyKarin/yogaswap/issues/249) | Multi-Tenant Subdomains | `*.app.yogaswap.de` |
| [#261](https://github.com/CurlyKarin/yogaswap/issues/261) | Onboarding erstes Studio | **beharmony** live |
| [#61](https://github.com/CurlyKarin/yogaswap/issues/61) | Tenant-Subdomains vorbereiten | Vorarbeit zu #249/#261 |
| [#80](https://github.com/CurlyKarin/yogaswap/issues/80) | SES Production + Domain | Marken-Absender |
| [#87](https://github.com/CurlyKarin/yogaswap/issues/87) | E-Mail-Aliase / Impressum | `support@yogaswap.de` |
| [#15](https://github.com/CurlyKarin/yogaswap/issues/15) | CI/CD staging/demo/prod | Betriebspfad |
| [#104](https://github.com/CurlyKarin/yogaswap/issues/104) | Go-Live-Runbook | Dry-Run / Checkliste |
| [#365](https://github.com/CurlyKarin/yogaswap/issues/365) | Marketing-Landingpage `yogaswap.de` | noch offen |

---

## 8. Nachzutragen (für die Anwaltsakte)

- [x] Exaktes **Domain-Registrierungsdatum** `yogaswap.de`: **2026-03-12, 11:57** (Bestätigungsmail)
- [x] **Inhaberin:** Karin Schrader
- [ ] Optional: Screenshot / PDF der Bestätigungsmail bzw. IONOS-Domain-Übersicht zur Akte heften
- [ ] Optional: Datum der ersten **öffentlichen** Nutzung gegenüber Dritten (z. B. erste echte Invite an beharmony-Mitglieder) — laut #261 um **2026-07-30**

---

## 9. Quellenverzeichnis (Auswahl)

- GitHub Issue [#101](https://github.com/CurlyKarin/yogaswap/issues/101) Abschluss: Pilot beharmony live  
- GitHub Issue [#261](https://github.com/CurlyKarin/yogaswap/issues/261) Abschluss 2026-07-30  
- PRs: [#244](https://github.com/CurlyKarin/yogaswap/pull/244), [#254](https://github.com/CurlyKarin/yogaswap/pull/254), [#255](https://github.com/CurlyKarin/yogaswap/pull/255), [#260](https://github.com/CurlyKarin/yogaswap/pull/260), [#282](https://github.com/CurlyKarin/yogaswap/pull/282)  
- Docs: `docs/go-live-runbook.md`, `docs/tenant-host.md`, `docs/ses-production.md`, `docs/support-email-alias.md`  
- DENIC Whois `yogaswap.de` (Nameserver IONOS, Changed 2026-03-12)  
- Bestätigungsmail Domain-Registrierung `yogaswap.de`: **2026-03-12, 11:57**; Inhaberin: Karin Schrader  
