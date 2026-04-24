terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0"
    }
  }
  backend "local" {}
}

provider "aws" {
  region = var.region
}

locals {
  lambda_configs = {
    "get_swaps" = {
      name             = var.lambdas["get_swaps"].name
      file_name        = var.lambdas["get_swaps"].file_name
      table_arns       = [module.swaps_table.table_arn]
      dynamodb_actions = var.lambdas["get_swaps"].dynamodb_actions
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "get_swaps_by_status" = {
      name             = "get-swaps-by-status"
      file_name        = "getSwapsByStatus.zip"
      table_arns       = [module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:Scan", "dynamodb:Query"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "create_swap" = {
      name             = "create-swap"
      file_name        = "createSwap.zip"
      table_arns       = [module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:PutItem"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "update_swap" = {
      name             = "update-swap"
      file_name        = "updateSwap.zip"
      table_arns       = [module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:UpdateItem"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "delete_swap" = {
      name             = "delete-swap"
      file_name        = "deleteSwap.zip"
      dynamodb_actions = ["dynamodb:DeleteItem"]
      table_arns       = [module.swaps_table.table_arn]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "get_coursedateoverrides" = {
      name             = var.lambdas["get_coursedateoverrides"].name
      file_name        = var.lambdas["get_coursedateoverrides"].file_name
      table_arns       = [module.course_overrides_table.table_arn]
      dynamodb_actions = var.lambdas["get_coursedateoverrides"].dynamodb_actions
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "create_override" = {
      name             = "create-override"
      file_name        = "createOverride.zip"
      table_arns       = [module.course_overrides_table.table_arn]
      dynamodb_actions = ["dynamodb:PutItem"]
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "update_override" = {
      name             = "update-override"
      file_name        = "updateOverride.zip"
      table_arns       = [module.course_overrides_table.table_arn]
      dynamodb_actions = ["dynamodb:UpdateItem"]
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "delete_override" = {
      name             = "delete-override"
      file_name        = "deleteOverride.zip"
      dynamodb_actions = ["dynamodb:DeleteItem"]
      table_arns       = [module.course_overrides_table.table_arn]
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "process_promotions" = {
      name             = "process-promotions"
      file_name        = "processPromotions.zip"
      table_arns       = [module.swaps_table.table_arn, module.course_overrides_table.table_arn, module.courses_table.table_arn]
      dynamodb_actions = ["dynamodb:Scan", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
      tables = {
        "SWAPS_TABLE"     = module.swaps_table.table_name
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
        "COURSES_TABLE"   = module.courses_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "get_courses" = {
      name             = "get-courses"
      file_name        = "getCourses.zip"
      table_arns       = [module.courses_table.table_arn]
      dynamodb_actions = ["dynamodb:Query", "dynamodb:GetItem"]
      tables = {
        "COURSES_TABLE" = module.courses_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "create_course" = {
      name             = "create-course"
      file_name        = "createCourse.zip"
      table_arns       = [module.courses_table.table_arn, module.memberships_table.table_arn]
      dynamodb_actions = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem"]
      tables = {
        "COURSES_TABLE"     = module.courses_table.table_name
        "MEMBERSHIPS_TABLE" = module.memberships_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "update_course" = {
      name             = "update-course"
      file_name        = "updateCourse.zip"
      table_arns       = [module.courses_table.table_arn, module.memberships_table.table_arn, module.course_overrides_table.table_arn, module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan"]
      tables = {
        "COURSES_TABLE"     = module.courses_table.table_name
        "MEMBERSHIPS_TABLE" = module.memberships_table.table_name
        "OVERRIDES_TABLE"   = module.course_overrides_table.table_name
        "SWAPS_TABLE"       = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "delete_course" = {
      name             = "delete-course"
      file_name        = "deleteCourse.zip"
      table_arns       = [module.courses_table.table_arn, module.memberships_table.table_arn, module.course_overrides_table.table_arn, module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"]
      tables = {
        "COURSES_TABLE"     = module.courses_table.table_name
        "MEMBERSHIPS_TABLE" = module.memberships_table.table_name
        "OVERRIDES_TABLE"   = module.course_overrides_table.table_name
        "SWAPS_TABLE"       = module.swaps_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "get_participants" = {
      name             = "get-participants"
      file_name        = "getParticipants.zip"
      table_arns       = [module.participants_table.table_arn, module.memberships_table.table_arn, module.tenants_table.table_arn]
      dynamodb_actions = ["dynamodb:Query", "dynamodb:GetItem"]
      tables = {
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "TENANTS_TABLE"      = module.tenants_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    },
    "update_participant" = {
      name             = "update-participant"
      file_name        = "updateParticipant.zip"
      table_arns       = [module.participants_table.table_arn, module.memberships_table.table_arn, module.tenants_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]
      tables = {
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "TENANTS_TABLE"      = module.tenants_table.table_name
      }
      s3_actions   = []
      s3_resources = []
      additional_policies = [
        {
          Effect = "Allow"
          Action = [
            "cognito-idp:AdminUpdateUserAttributes",
            "cognito-idp:AdminUserGlobalSignOut",
            "cognito-idp:AdminSetUserPassword"
          ]
          Resource = aws_cognito_user_pool.yogaswap.arn
        },
        {
          Effect   = "Allow"
          Action   = ["ses:SendEmail"]
          Resource = "*"
        }
      ]
      environment = {
        USER_POOL_ID     = aws_cognito_user_pool.yogaswap.id
        BASE_URL         = length(var.cloudfront_aliases) > 0 ? "https://${var.cloudfront_aliases[0]}" : module.cloudfront_spa.distribution_url
        SES_SOURCE_EMAIL = var.ses_source_email
      }
    },
    "delete_participant" = {
      name             = "delete-participant"
      file_name        = "deleteParticipant.zip"
      table_arns       = [module.participants_table.table_arn, module.memberships_table.table_arn, module.tenants_table.table_arn, module.courses_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:Scan", "dynamodb:Query", "dynamodb:PutItem"]
      tables = {
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "TENANTS_TABLE"      = module.tenants_table.table_name
        "COURSES_TABLE"      = module.courses_table.table_name
      }
      s3_actions   = []
      s3_resources = []
      additional_policies = [
        {
          Effect   = "Allow"
          Action   = ["ses:SendEmail"]
          Resource = "*"
        }
      ]
      environment = {
        SES_SOURCE_EMAIL = var.ses_source_email
      }
    },
    "create_participants" = {
      name             = "create-participants"
      file_name        = "createParticipants.zip"
      timeout          = 15
      table_arns       = [module.memberships_table.table_arn, module.participants_table.table_arn, module.auth_tokens_table.table_arn]
      dynamodb_actions = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"]
      tables = {
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
        "AUTH_TOKENS_TABLE"   = module.auth_tokens_table.table_name
      }
      s3_actions   = []
      s3_resources = []
      additional_policies = [
        {
          Effect = "Allow"
          Action = [
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminAddUserToGroup",
            "cognito-idp:AdminSetUserPassword",
            "cognito-idp:AdminUpdateUserAttributes",
            "cognito-idp:AdminGetUser"
          ]
          Resource = aws_cognito_user_pool.yogaswap.arn
        },
        {
          Effect   = "Allow"
          Action   = ["ses:SendEmail"]
          Resource = "*"
        }
      ]
      environment = {
        USER_POOL_ID     = aws_cognito_user_pool.yogaswap.id
        BASE_URL         = length(var.cloudfront_aliases) > 0 ? "https://${var.cloudfront_aliases[0]}" : module.cloudfront_spa.distribution_url
        SES_SOURCE_EMAIL = var.ses_source_email # E-Mail-Adresse für SES-Absender (muss verifiziert sein)
        AUTH_TOKENS_TABLE = module.auth_tokens_table.table_name
      }
    },
    "reset_participant_password" = {
      name             = "reset-participant-password"
      file_name        = "resetParticipantPassword.zip"
      table_arns       = [module.memberships_table.table_arn, module.participants_table.table_arn, module.auth_tokens_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:PutItem"]
      tables = {
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
        "AUTH_TOKENS_TABLE"   = module.auth_tokens_table.table_name
      }
      s3_actions   = []
      s3_resources = []
      additional_policies = [
        {
          Effect = "Allow"
          Action = [
            "cognito-idp:AdminSetUserPassword"
          ]
          Resource = aws_cognito_user_pool.yogaswap.arn
        },
        {
          Effect   = "Allow"
          Action   = ["ses:SendEmail"]
          Resource = "*"
        }
      ]
      environment = {
        USER_POOL_ID     = aws_cognito_user_pool.yogaswap.id
        BASE_URL         = length(var.cloudfront_aliases) > 0 ? "https://${var.cloudfront_aliases[0]}" : module.cloudfront_spa.distribution_url
        SES_SOURCE_EMAIL = var.ses_source_email
        AUTH_TOKENS_TABLE = module.auth_tokens_table.table_name
      }
    },
    "request_self_password_reset" = {
      name             = "request-self-password-reset"
      file_name        = "requestSelfPasswordReset.zip"
      table_arns       = [module.memberships_table.table_arn, module.participants_table.table_arn, module.auth_tokens_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem"]
      tables = {
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
        "AUTH_TOKENS_TABLE"  = module.auth_tokens_table.table_name
      }
      s3_actions   = []
      s3_resources = []
      additional_policies = [
        {
          Effect   = "Allow"
          Action   = ["ses:SendEmail"]
          Resource = "*"
        }
      ]
      environment = {
        BASE_URL          = length(var.cloudfront_aliases) > 0 ? "https://${var.cloudfront_aliases[0]}" : module.cloudfront_spa.distribution_url
        SES_SOURCE_EMAIL  = var.ses_source_email
        AUTH_TOKENS_TABLE = module.auth_tokens_table.table_name
      }
    },
    "get_tenant_context" = {
      name      = "get-tenant-context"
      file_name = "getTenantContext.zip"
      table_arns = [
        module.tenants_table.table_arn,
        module.memberships_table.table_arn,
        module.participants_table.table_arn
      ]
      dynamodb_actions = ["dynamodb:GetItem"]
      tables = {
        "TENANTS_TABLE"      = module.tenants_table.table_name
        "MEMBERSHIPS_TABLE"  = module.memberships_table.table_name
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
      }
      s3_actions   = []
      s3_resources = []
    }
    "start_password_reset_from_token" = {
      name             = "start-password-reset-from-token"
      file_name        = "startPasswordResetFromToken.zip"
      table_arns       = [module.auth_tokens_table.table_arn, module.participants_table.table_arn]
      dynamodb_actions = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
      tables = {
        "AUTH_TOKENS_TABLE" = module.auth_tokens_table.table_name
        "PARTICIPANTS_TABLE" = module.participants_table.table_name
      }
      s3_actions   = []
      s3_resources = []
      additional_policies = [
        {
          Effect = "Allow"
          Action = ["cognito-idp:AdminResetUserPassword"]
          Resource = aws_cognito_user_pool.yogaswap.arn
        }
      ]
      environment = {
        USER_POOL_ID      = aws_cognito_user_pool.yogaswap.id
        AUTH_TOKENS_TABLE = module.auth_tokens_table.table_name
        PARTICIPANTS_TABLE = module.participants_table.table_name
      }
    }
  }
  # Map für Lambda-ARNs
  lambda_arns = { for k, v in aws_lambda_function.lambda : k => v.arn }

  # API Gateway Routen
  api_routes = {
    "GET /swaps"                                 = "get_swaps"
    "GET /swaps/status"                          = "get_swaps_by_status"
    "GET /course-overrides"                      = "get_coursedateoverrides"
    "POST /swaps"                                = "create_swap"
    "PUT /swaps/{swapId}"                        = "update_swap"
    "DELETE /swaps/{swapId}"                     = "delete_swap"
    "POST /course-overrides"                     = "create_override"
    "PUT /course-overrides/{courseId}/{date}"    = "update_override"
    "DELETE /course-overrides/{courseId}/{date}" = "delete_override"
    "POST /process-promotions"                   = "process_promotions"
    "GET /courses"                               = "get_courses"
    "POST /courses"                              = "create_course"
    "PUT /courses/{courseId}"                    = "update_course"
    "DELETE /courses/{courseId}"                 = "delete_course"
    "GET /participants"                          = "get_participants"
    "POST /participants"                         = "create_participants"
    "POST /participants/{userId}/password-reset" = "reset_participant_password"
    "POST /auth/password-reset/request"          = "request_self_password_reset"
    "POST /auth/password-reset/from-token"       = "start_password_reset_from_token"
    "PUT /participants/{userId}"                 = "update_participant"
    "DELETE /participants/{userId}"              = "delete_participant"
    "GET /tenant-context"                        = "get_tenant_context"
  }

  build_files = fileset("../../app/build", "**")
  build_hash  = sha1(join(",", [for f in local.build_files : filesha256("../../app/build/${f}")]))
}

#--------------apigateway--------------------
module "yogaswap_api" {
  source      = "../modules/apigatewayv2"
  name        = "${var.project}-api"
  lambda_arns = local.lambda_arns
  routes      = local.api_routes
  jwt_issuer  = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.yogaswap.id}"
  jwt_audience = [
    aws_cognito_user_pool_client.yogaswap_app.id,
  ]
  protected_routes = [
    "GET /participants",
    "PUT /participants/{userId}",
    "DELETE /participants/{userId}",
    "POST /participants",
    "POST /participants/{userId}/password-reset",
    "POST /courses",
    "PUT /courses/{courseId}",
    "DELETE /courses/{courseId}",
    "GET /tenant-context",
  ]
}
#---------------cloudfront------------------

module "cloudfront_spa" {
  source                  = "../modules/cloudfront"
  bucket_name             = module.spa_site.bucket_name
  bucket_domain_name      = module.spa_site.bucket_regional_domain
  api_gateway_domain_name = replace(module.yogaswap_api.api_endpoint, "https://", "")
  aliases                 = var.cloudfront_aliases
  acm_certificate_arn     = var.cloudfront_acm_certificate_arn
}

resource "null_resource" "cloudfront_invalidation" {
  triggers = {
    build_hash      = local.build_hash
    distribution_id = module.cloudfront_spa.distribution_id
  }

  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${self.triggers.distribution_id} --paths '/*'"
  }

  depends_on = [
    aws_s3_object.spa_files,
    null_resource.upload_frontend,
  ]
}

output "api_url" {
  value = module.yogaswap_api.url
}

output "cloudfront_domain" {
  value = module.cloudfront_spa.distribution_url
}

output "spa_bucket_regional_name" {
  value = module.spa_site.bucket_regional_domain
}

output "api_endpoint" {
  value = module.yogaswap_api.api_endpoint
}
