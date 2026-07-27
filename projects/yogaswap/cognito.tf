# Cognito User Pool
resource "aws_cognito_user_pool" "yogaswap" {
  name = "${local.project}-users"

  # Self-Sign-Up erlauben
  auto_verified_attributes = ["email"]

  # Cognito-Code-Mails über SES (#106), nicht no-reply@verificationemail.com.
  # Absender = ses_source_email (noreply@yogaswap.de) in allen Envs.
  email_configuration {
    email_sending_account = "DEVELOPER"
    from_email_address    = local.cognito_from_email_address
    source_arn            = local.ses_domain_identity_arn
  }

  # DE Custom Message für Forgot/Admin-Reset-Codes (#107/#108).
  # Eigene Lambda-Ressource (nicht in local.lambda_configs), sonst Zyklus:
  # lambda_configs → Cognito Pool → custom_message Lambda → lambda_configs.
  lambda_config {
    custom_message = aws_lambda_function.cognito_custom_message.arn
  }

  # Admin erstellt User
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length    = 6
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
    require_uppercase = false
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "email"
    required            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "role"
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type = "String"
    mutable             = true
    name                = "nickname"
    required            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }
}

# Checkmark App Client
resource "aws_cognito_user_pool_client" "yogaswap_app" {
  name         = "${local.project}-app-client"
  user_pool_id = aws_cognito_user_pool.yogaswap.id

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  generate_secret = false

  callback_urls = concat(
    ["https://${module.cloudfront_spa.distribution_url}", "http://localhost:5173"],
    [for alias in local.cloudfront_apex_aliases : "https://${alias}"],
  )

  logout_urls = concat(
    ["https://${module.cloudfront_spa.distribution_url}", "http://localhost:5173"],
    [for alias in local.cloudfront_apex_aliases : "https://${alias}"],
  )
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.yogaswap.id
  description  = "Administratoren"
  precedence   = 0 # niedrigere Zahl = höhere Priorität falls mehrere Rollen relevant sind
  # optional: role_arn = aws_iam_role.some_role.arn
}

resource "aws_cognito_user_group" "instructor" {
  name         = "instructor"
  user_pool_id = aws_cognito_user_pool.yogaswap.id
  description  = "Instructoren"
  precedence   = 10
}

resource "aws_cognito_user_group" "participant" {
  name         = "participant"
  user_pool_id = aws_cognito_user_pool.yogaswap.id
  description  = "Teilnehmer"
  precedence   = 20
}

# Cognito Custom Message (#107/#108) — bewusst außerhalb von lambda_configs (Zyklus-Vermeidung).
resource "aws_iam_role" "cognito_custom_message" {
  name = "${local.project}-cognito-custom-message"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "cognito_custom_message" {
  name = "${local.project}-cognito-custom-message"
  role = aws_iam_role.cognito_custom_message.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "cognito_custom_message" {
  function_name = "${local.project}-cognito-custom-message"
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 5
  role          = aws_iam_role.cognito_custom_message.arn
  filename      = "${path.module}/../../backend/zips/cognitoCustomMessage.zip"
  source_code_hash = filebase64sha256("${path.module}/../../backend/zips/cognitoCustomMessage.zip")

  environment {
    variables = {
      MAIL_LOCALE = "de"
    }
  }
}

resource "aws_lambda_permission" "cognito_custom_message" {
  statement_id  = "AllowCognitoInvokeCustomMessage"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_custom_message.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.yogaswap.arn
}

# Checkmark Outputs
output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.yogaswap.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.yogaswap_app.id
}

output "cognito_region" {
  value = var.region
}