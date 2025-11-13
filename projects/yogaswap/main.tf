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
      name           = var.lambdas["get_swaps"].name
      file_name      = var.lambdas["get_swaps"].file_name
      table_arns     = [module.swaps_table.table_arn]
      dynamodb_actions = var.lambdas["get_swaps"].dynamodb_actions
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "get_swaps_by_status" = {
      name           = "get-swaps-by-status"
      file_name      = "getSwapsByStatus.zip"
      table_arns     = [module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:Scan", "dynamodb:Query"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "create_swap" = {
      name           = "create-swap"
      file_name      = "createSwap.zip"
      table_arns     = [module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:PutItem"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "update_swap" = {
      name           = "update-swap"
      file_name      = "updateSwap.zip"
      table_arns     = [module.swaps_table.table_arn]
      dynamodb_actions = ["dynamodb:UpdateItem"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "delete_swap" = {
      name           = "delete-swap"
      file_name      = "deleteSwap.zip"
      dynamodb_actions = ["dynamodb:DeleteItem"]      
      table_arns     = [module.swaps_table.table_arn]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "get_coursedateoverrides" = {
      name           = var.lambdas["get_coursedateoverrides"].name
      file_name      = var.lambdas["get_coursedateoverrides"].file_name
      table_arns     = [module.course_overrides_table.table_arn]
      dynamodb_actions = var.lambdas["get_coursedateoverrides"].dynamodb_actions
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "create_override" = {
      name           = "create-override"
      file_name      = "createOverride.zip"
      table_arns     = [module.course_overrides_table.table_arn]
      dynamodb_actions = ["dynamodb:PutItem"]
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "update_override" = {
      name           = "update-override"
      file_name      = "updateOverride.zip"
      table_arns     = [module.course_overrides_table.table_arn]
      dynamodb_actions = ["dynamodb:UpdateItem"]
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "delete_override" = {
      name           = "delete-override"
      file_name      = "deleteOverride.zip"
      dynamodb_actions = ["dynamodb:DeleteItem"]      
      table_arns     = [module.course_overrides_table.table_arn]
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "process_promotions" = {
      name           = "process-promotions"
      file_name      = "processPromotions.zip"
      table_arns     = [module.swaps_table.table_arn, module.course_overrides_table.table_arn, module.courses_table.table_arn]
      dynamodb_actions = ["dynamodb:Scan", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
      tables = {
        "SWAPS_TABLE" = module.swaps_table.table_name
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
        "COURSES_TABLE" = module.courses_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "get_courses" = {
      name           = "get-courses"
      file_name      = "getCourses.zip"
      table_arns     = [module.courses_table.table_arn]
      dynamodb_actions = ["dynamodb:Scan", "dynamodb:GetItem"]
      tables = {
        "COURSES_TABLE" = module.courses_table.table_name
      }
      s3_actions     = []
      s3_resources   = []
    },
    "create_participants" = {
      name           = "create-participants"
      file_name      = "createParticipants.zip"
      table_arns     = []
      dynamodb_actions = []
      tables = { }
      s3_actions     = []
      s3_resources   = []
      additional_policies = [
        {
          Effect   = "Allow"
          Action   = [
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminAddUserToGroup"
          ]
          Resource = aws_cognito_user_pool.yogaswap.arn
        },
        {
          Effect   = "Allow"
          Action   = ["ses:SendEmail"]
          Resource = "*"
        }
      ]
      environment = {  # Checkmark HINZUFÜGEN!
        USER_POOL_ID = aws_cognito_user_pool.yogaswap.id
      }
    }
  }
   # Map für Lambda-ARNs
  lambda_arns = { for k, v in aws_lambda_function.lambda : k => v.arn }

  # API Gateway Routen
  api_routes = {
    "GET /swaps" = "get_swaps"
    "GET /swaps/status" = "get_swaps_by_status"
    "GET /course-overrides" = "get_coursedateoverrides"
    "POST /swaps" = "create_swap"
    "PUT /swaps/{swapId}" = "update_swap"
    "DELETE /swaps/{swapId}" = "delete_swap"
    "POST /course-overrides" = "create_override"
    "PUT /course-overrides/{courseId}/{date}" = "update_override"
    "DELETE /course-overrides/{courseId}/{date}" = "delete_override"
    "POST /process-promotions" = "process_promotions"
    "GET /courses" = "get_courses"
    "POST /participants" = "create_participants"
  }

  build_files = fileset("../../app/build", "**")
  build_hash  = sha1(join(",", [for f in local.build_files : filesha256("../../app/build/${f}")]))
}

#--------------apigateway--------------------
module "yogaswap_api" {
  source       = "../modules/apigatewayv2"
  name         = "${var.project}-api"
  lambda_arns  = local.lambda_arns
  routes       = local.api_routes
}
#---------------cloudfront------------------

module "cloudfront_spa" {
  source      = "../modules/cloudfront"
  bucket_name = module.spa_site.bucket_name
  bucket_domain_name = module.spa_site.bucket_regional_domain
  api_gateway_domain_name = replace(module.yogaswap_api.api_endpoint, "https://", "")
}

resource "random_id" "invalidation" {
  byte_length = 4
  keepers = {
    # Erzeuge neue ID bei jedem Plan/Apply, um Invalidierung zu triggern
    always_run = timestamp()
  }
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
