# Cognito User Pool
resource "aws_cognito_user_pool" "yogaswap" {
  name = "${local.project}-users"

  # Self-Sign-Up erlauben
  auto_verified_attributes = ["email"]

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
    [for alias in local.cloudfront_aliases : "https://${alias}"],
  )

  logout_urls = concat(
    ["https://${module.cloudfront_spa.distribution_url}", "http://localhost:5173"],
    [for alias in local.cloudfront_aliases : "https://${alias}"],
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