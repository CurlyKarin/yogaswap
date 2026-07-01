# Env-Konfiguration abgeleitet aus dem aktiven OpenTofu-Workspace (#241).
#
# Ziel: Im Alltag genuegt `tofu workspace select <env> && tofu apply` ohne
# `-var-file`. Die env-spezifischen Werte werden NICHT mehr aus tfvars gelesen,
# sondern hier aus `terraform.workspace` abgeleitet. Damit ist ein Vermischen
# der Umgebungen technisch ausgeschlossen (vergessenes `-var-file` greift nicht
# mehr auf prod-Werte).
#
# Aufteilung wegen oeffentlichem Repo:
# - Nicht-sensible Werte (project, cloudfront_aliases) stehen unten committed.
# - Sensible Werte (Emails = PII, cert-ARN enthaelt AWS-Account-ID) liegen pro
#   Workspace in der gitignored Datei env.<workspace>.json
#   (Vorlage: env.<workspace>.json.example).

locals {
  # Nicht-sensible, env-spezifische Werte je Workspace.
  # Hinweis zur Benennung: Das Ressourcen-Praefix (project) ist ein Implementierungs-
  # detail; die fachliche Umgebung steckt in "environment" (Tagging, Kostenzuordnung).
  # "default" haelt aktuell nur Demo-Daten -> Environment=demo. Der echte prod-Stack
  # bekommt einen eigenen Workspace (yogaswap-prod, siehe #248).
  env_public = {
    default = {
      project            = "yogaswap-demo"
      environment        = "demo"
      cloudfront_aliases = ["demo.yogaswap.de"]
    }
    staging = {
      project            = "yogaswap-staging"
      environment        = "staging"
      cloudfront_aliases = ["staging.yogaswap.de"]
    }
    prod = {
      project            = "yogaswap-prod"
      environment        = "prod"
      cloudfront_aliases = ["app.yogaswap.de"]
    }
  }

  # Harte Absicherung: unbekannter Workspace -> klarer Fehler statt prod-Fallback.
  env_current = local.env_public[terraform.workspace]

  # Sensible Werte pro Workspace aus gitignored JSON (nicht im Repo).
  env_secrets = jsondecode(file("${path.module}/env.${terraform.workspace}.json"))

  project                        = local.env_current.project
  environment                    = local.env_current.environment
  cloudfront_aliases             = local.env_current.cloudfront_aliases
  ses_source_email               = local.env_secrets.ses_source_email
  studio_notification_emails     = local.env_secrets.studio_notification_emails
  cloudfront_acm_certificate_arn = local.env_secrets.cloudfront_acm_certificate_arn

  # Standardisierte AWS-Tags (#16). Pflicht: Project/Environment/ManagedBy.
  # Optional (nur wenn in env.<workspace>.json gesetzt): Owner, CostCenter.
  optional_tags = merge(
    try(local.env_secrets.owner, "") != "" ? { Owner = local.env_secrets.owner } : {},
    try(local.env_secrets.cost_center, "") != "" ? { CostCenter = local.env_secrets.cost_center } : {},
  )
  common_tags = merge({
    Project     = "yogaswap"
    Environment = local.environment
    ManagedBy   = "terraform"
  }, local.optional_tags)
}
