
variable "project" {
  description = "Projektname für Ressourcen-Namen"
  type        = string
  default     = "yogaswap-backend-demo"
}

variable "region" {
  description = "AWS-Region"
  type        = string
  default     = "eu-central-1"
}

variable "ses_source_email" {
  description = "E-Mail-Adresse für SES-Absender (muss in AWS SES verifiziert sein)"
  type        = string
  default     = "yogaswap@example.com"
}

variable "studio_notification_emails" {
  description = "Comma-separated Empfänger für Studio-Benachrichtigungen (z. B. Terminabsagen)"
  type        = string
  default     = ""
}

variable "cloudfront_aliases" {
  description = "CloudFront Alternate Domain Names (CNAMEs), z.B. [\"app.yogaswap.de\"]"
  type        = list(string)
  default     = []
}

variable "cloudfront_acm_certificate_arn" {
  description = "ACM Zertifikat-ARN (MUSS in us-east-1 liegen) für CloudFront. Leer lassen, um Default-Zertifikat zu nutzen."
  type        = string
  default     = ""
}

variable "lambdas" {
  description = "Map von Lambda-Funktionen und deren Eigenschaften"
  type = map(object({
    name             = string
    file_name        = string
    table_arns       = list(string) # Liste von DynamoDB-Tabellen-ARNs
    dynamodb_actions = list(string) # Aktionen, die die Lambda ausführen darf
    s3_actions       = list(string)
  }))
  default = {
    "get_swaps" = {
      name             = "get-swaps"
      file_name        = "getSwaps.zip"
      table_arns       = [] # Wird später gefüllt
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:Scan", "dynamodb:Query"]
      s3_actions       = []
    },
    "get_coursedateoverrides" = {
      name             = "get-coursedateoverrides"
      file_name        = "getOverrides.zip"
      table_arns       = [] # Wird später gefüllt
      dynamodb_actions = ["dynamodb:Query", "dynamodb:GetItem"]
      s3_actions       = []
    }
  }
}
