# Optional: SES Email Identity für die Absender-E-Mail-Adresse
# Hinweis: Die E-Mail-Adresse muss trotzdem manuell verifiziert werden (Verifizierungs-E-Mail bestätigen)
#
# Wenn du eine Domain verwendest, nutze stattdessen aws_ses_domain_identity (siehe unten)
#
# Uncomment um zu aktivieren:
# resource "aws_ses_email_identity" "source_email" {
#   email = local.ses_source_email
# }
#
# output "ses_verification_token" {
#   value = aws_ses_email_identity.source_email.verification_token
#   description = "Verifizierungs-Token (für E-Mail-Adressen nicht relevant, wird per E-Mail versendet)"
# }

# Optional: SES Domain Identity (empfohlen für Produktion)
# Wenn du eine Domain verifizieren möchtest, nutze diese Ressource
# Dann kannst du alle E-Mails von *@deine-domain.de senden
#
# Uncomment und ersetze "example.com" mit deiner Domain:
# resource "aws_ses_domain_identity" "yogaswap_domain" {
#   domain = "yogaswap.de"
# }
#
# Output zeigt die benötigten DNS-Einträge:
# output "ses_domain_verification_token" {
#   value = aws_ses_domain_identity.yogaswap_domain.verification_token
#   description = "DNS TXT Record: _amazonses.yogaswap.de -> ${aws_ses_domain_identity.yogaswap_domain.verification_token}"
# }

# Optional: Easy DKIM für Domain (automatische DKIM-Signatur)
# Wenn du eine Domain verwendest, aktiviere Easy DKIM:
#
# resource "aws_ses_domain_identity_verification" "yogaswap_domain_verification" {
#   domain = aws_ses_domain_identity.yogaswap_domain.id
#
#   timeouts {
#     create = "5m"
#   }
# }
#
# resource "aws_ses_domain_dkim" "yogaswap_domain_dkim" {
#   domain = aws_ses_domain_identity.yogaswap_domain.id
# }
#
# output "ses_dkim_tokens" {
#   value = aws_ses_domain_dkim.yogaswap_domain_dkim.dkim_tokens
#   description = "DNS CNAME Records für DKIM (3 Tokens)"
# }
