# SES Production Access (#80)

Ziel: Einladungs- und App-Mails von `noreply@yogaswap.de` an **unverifizierte** Empfänger (echte Studio-Teilnehmer:innen).

## Ist / Soll

| | Sandbox (aktuell) | Production |
|---|---|---|
| Empfänger | nur vorab verifizierte Adressen | beliebige gültige Adressen |
| Absender | bisher Privatadresse | Domain `yogaswap.de` → `noreply@yogaswap.de` |
| Limit | ~200/Tag | höher (AWS-kontingent) |

Code und Lambdas sind bereit (`SES_SOURCE_EMAIL`). Blocker sind Domain-DNS + Sandbox-Exit.

## Reihenfolge

1. **Domain-Identity anlegen** (OpenTofu, nur Workspace `prod`)
2. **DNS bei IONOS** (Verify + DKIM)
3. **Verifizierung abwarten**
4. **`ses_source_email`** in allen `env.*.json` auf `noreply@yogaswap.de` + `tofu apply` je Workspace (erst **nach** Domain-Verify, sonst schlagen Sends fehl)
5. **Production Access** in der AWS-Konsole beantragen
6. **E2E-Invite** an eine neue externe Testadresse
7. Optional: Bounce/Complaint in CloudWatch im Blick behalten

## 1) Domain per OpenTofu

```bash
cd projects/yogaswap
tofu workspace select prod
tofu apply
tofu output ses_domain_verification_token
tofu output ses_dkim_tokens
```

Ressourcen liegen in `ses.tf` und gelten nur für Workspace `prod` (account-weite Identity).

**Wichtig:** Solange die Domain noch nicht verifiziert ist, `ses_source_email` nicht auf `noreply@…` umstellen bzw. die Env-Applies zurückhalten — sonst schlagen alle SES-Sends fehl.

## 2) DNS bei IONOS (yogaswap.de)

Ersetze `<token>` / `<dkimN>` durch die tofu-Outputs.

| Typ | Name / Host | Wert |
|---|---|---|
| TXT | `_amazonses` | `<verification_token>` |
| CNAME | `<dkim1>._domainkey` | `<dkim1>.dkim.amazonses.com` |
| CNAME | `<dkim2>._domainkey` | `<dkim2>.dkim.amazonses.com` |
| CNAME | `<dkim3>._domainkey` | `<dkim3>.dkim.amazonses.com` |

Hinweise IONOS:

- Oft Host **ohne** Domain-Suffix eintragen (`_amazonses`, nicht `_amazonses.yogaswap.de`).
- TTL kann erst niedrig (300 s), später erhöhen.
- Propagation: Minuten bis wenige Stunden.

Optional (Zustellbarkeit — **vor Go-Live setzen**, sonst oft Spam):

### SPF (bestehenden TXT am Domain-Root **ersetzen**, nicht zweiten `v=spf1` anlegen)

Aktuell bei IONOS typischerweise nur IONOS-Mail:

```text
v=spf1 include:_spf-eu.ionos.com ~all
```

**Soll** (IONOS + Amazon SES in einem Record):

| Typ | Name / Host | Wert |
|---|---|---|
| TXT | `@` (Domain-Root) | `v=spf1 include:_spf-eu.ionos.com include:amazonses.com ~all` |

### DMARC

IONOS liefert oft nur einen CNAME auf `dmarc.ionos.de`. Besser eigener TXT:

| Typ | Name / Host | Wert |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:karin.schrader@online.de; adkim=s; aspf=s` |

`p=none` erst beobachten; später ggf. `quarantine`. Prüfen:

```bash
dig +short TXT yogaswap.de @8.8.8.8
dig +short TXT _dmarc.yogaswap.de @8.8.8.8
```

**Mailbox:** Fürs *Senden* von `noreply@…` brauchst du kein Postfach. Antworten landen sonst im Nichts — Absender bewusst „noreply“.

**Absender-Anzeige:** App- und Cognito-Mails nutzen `YogaSwap <noreply@yogaswap.de>` (Display-Name, kein separates Postfach).

## 3) Verifizierung prüfen

```bash
aws sesv2 get-email-identity --email-identity yogaswap.de --region eu-central-1 \
  --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'
```

Erwartung: `Verified=true`, DKIM `SUCCESS`.

## 4) Absender in den Envs

In gitignored `env.default.json` / `env.staging.json` / `env.prod.json`:

```json
"ses_source_email": "noreply@yogaswap.de"
```

Danach je Workspace:

```bash
tofu workspace select default && tofu apply
tofu workspace select staging && tofu apply
tofu workspace select prod && tofu apply
```

Smoke-Check:

```bash
aws lambda get-function-configuration \
  --function-name yogaswap-prod-create-participants \
  --query 'Environment.Variables.SES_SOURCE_EMAIL' --output text
```

## 5) Production Access beantragen

AWS Console → **SES** → Region **eu-central-1** → Account dashboard → **Request production access**  
(oder Support Center → Service limit increase → SES).

Vorschlag Text:

- **Mail type:** Transactional  
- **Website URL:** `https://app.yogaswap.de`  
- **Use case:** YogaSwap lädt Studio-Teilnehmer:innen per Einladungs-Mail ein und sendet transaktionale Kurs-/Tausch-Benachrichtigungen. Kein Marketing-Bulk. Opt-out über Studio-Admin (Zugang entfernen); Bounces/Complaints über SES-Suppression.  
- **Bounce/Complaint handling:** SES account-level suppression (BOUNCE, COMPLAINT); bei `emailSent=false` zeigt das AdminPanel das temporäre Passwort zur manuellen Übergabe.  
- **Expected volume:** niedrig (Pilot: wenige Dutzend Mails/Tag, &lt; 1000/Monat anfangs)

Freigabe kann Stunden bis wenige Werktage dauern.

Status:

```bash
aws sesv2 get-account --region eu-central-1 --query ProductionAccessEnabled
```

## 6) E2E-Test (Akzeptanz #80)

1. AdminPanel (Demo oder Staging reicht nach Prod-Access; in Sandbox nur verifizierte Empfänger)
2. Neue, **nicht** in SES verifizierte Testadresse einladen
3. Response: `success=true`, `emailSent=true`
4. Mail öffnen, Invite-Link, Passwort setzen
5. Lambda-Logs: kein SES-Send-Warning

## Support-Fallback (Runbook)

Wenn `emailSent=false` (SES-Störung, Sandbox, unverifizierte Domain):

1. AdminPanel zeigt / API liefert `tempPassword`
2. Passwort und Login-URL (`https://app.yogaswap.de` bzw. Studio-Subdomain) manuell an die Person übergeben (z. B. Messenger)
3. CloudWatch Logs der Lambda `*-create-participants` prüfen (`Failed to send` / SES-Fehler)
4. Nach Fix erneute Einladung oder Passwort-Reset aus dem AdminPanel

## Monitoring (Minimum)

CloudWatch → Metrics → **AWS/SES**:

- `Send` / `Bounce` / `Complaint`
- `Reputation.BounceRate`, `Reputation.ComplaintRate`

Alarm-Schwellen später (Post-Rollout): Bounce ≫ 5 %, Complaint ≫ 0,1 %. Bis dahin manuell beim Pilot prüfen.

## Abgrenzung

- **#106:** Cognito User Pools (demo/staging/prod) nutzen SES `DEVELOPER` mit From `YogaSwap <noreply@yogaswap.de>` (gleiche Adresse wie App-Mails, kein `no-reply@`). IaC: `cognito.tf` + SES Identity-Policy in `ses.tf` (prod).
- **#107 / #108:** Cognito Custom Message Lambda `cognito-custom-message` setzt deutsche Betreff/Body-Texte für `ForgotPassword` und `AdminResetUserPassword` (Bestaetigungscode). Trigger + IAM in `cognito.tf` / `main.tf`.
- Cognito `MessageAction: SUPPRESS` bleibt für Invite/Reset über App-Token; die zweite Code-Mail nach dem Link läuft über Custom Message + SES.

### Smoke-Test Cognito-Code-Mail (#107/#108)

1. Demo oder Staging: Admin → Passwort zurücksetzen (oder Invite-Link öffnen)
2. App-Mail mit Link kommt (Betreff `YogaSwap Passwort zuruecksetzen` / Einladung)
3. Link öffnen → Passwort setzen → Cognito sendet Code-Mail
4. Erwartung Code-Mail:
   - From: `YogaSwap <noreply@yogaswap.de>`
   - Subject: `YogaSwap Bestaetigungscode`
   - Body deutsch, enthält den Code / Hinweis „Bestaetigungscode“
5. Optional Logs: `/aws/lambda/<project>-cognito-custom-message`

Vollständige QA-Checkliste, Testergebnisse, Freigabe und Rollback: [`docs/cognito-mail-qa.md`](./cognito-mail-qa.md) (#109).

Kontakt-Alias `support@yogaswap.de` (Impressum, kein Versand): [`docs/support-email-alias.md`](./support-email-alias.md) (#87).
