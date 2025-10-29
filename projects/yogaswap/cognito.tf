# Checkmark Cognito User Pool
resource "aws_cognito_user_pool" "yogaswap" {
  name = "${var.project}-users"

  # Self-Sign-Up erlauben
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 6
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
    require_uppercase = false
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "email"
    required                 = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "custom:role"
    required                 = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "custom:nickname"
    required                 = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }
}

# Checkmark App Client
resource "aws_cognito_user_pool_client" "yogaswap_app" {
  name         = "${var.project}-app-client"
  user_pool_id = aws_cognito_user_pool.yogaswap.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  generate_secret = false
}

# infrastructure/main.tf
resource "aws_cognito_user" "luna" {
  user_pool_id = aws_cognito_user_pool.yogaswap.id
  username     = "luna@example.com"
  password     = "Temp123!"

  attributes = {
    email          = "luna@example.com"
    email_verified = true
    "custom:role"  = "participant"
    "custom:nickname" = "Luna"
  }
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