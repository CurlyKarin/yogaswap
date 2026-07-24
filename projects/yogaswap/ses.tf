# SES Domain Identity für yogaswap.de (#80).
#
# Account-/region-weit (nicht pro Env-Stack). Deshalb nur im Workspace `prod`
# verwaltet — sonst würden default/staging/prod um dieselbe AWS-Ressource kämpfen.
# Absender in allen Envs: noreply@yogaswap.de (env.<workspace>.json).
#
# Ablauf:
# 1) tofu workspace select prod && tofu apply  → Outputs: Verify-TXT + DKIM-CNAMEs
# 2) DNS bei IONOS setzen (siehe docs/ses-production.md)
# 3) Verifizierung abwarten, dann Production Access beantragen

locals {
  manage_ses_domain = terraform.workspace == "prod"
  ses_mail_domain   = "yogaswap.de"
}

resource "aws_ses_domain_identity" "yogaswap" {
  count  = local.manage_ses_domain ? 1 : 0
  domain = local.ses_mail_domain
}

resource "aws_ses_domain_dkim" "yogaswap" {
  count  = local.manage_ses_domain ? 1 : 0
  domain = aws_ses_domain_identity.yogaswap[0].domain
}

# Kein aws_ses_domain_identity_verification hier: erster Apply soll sofort
# die DNS-Tokens ausgeben. Verifizierung danach manuell/CLI prüfen
# (docs/ses-production.md), optional später als Resource nachziehen.

output "ses_domain" {
  value       = local.manage_ses_domain ? local.ses_mail_domain : null
  description = "SES-Mail-Domain (nur Workspace prod)"
}

output "ses_domain_verification_token" {
  value       = try(aws_ses_domain_identity.yogaswap[0].verification_token, null)
  description = "DNS TXT: Name=_amazonses.yogaswap.de, Value=<token>"
}

output "ses_dkim_tokens" {
  value       = try(aws_ses_domain_dkim.yogaswap[0].dkim_tokens, null)
  description = "DNS CNAME je Token: <token>._domainkey.yogaswap.de → <token>.dkim.amazonses.com"
}

output "ses_source_email_effective" {
  value       = local.ses_source_email
  description = "Aktueller SES-Absender aus env.<workspace>.json"
}
