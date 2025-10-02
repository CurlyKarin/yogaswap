terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0" # Neueste stabile Version
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
    }
  }
   # Map für Lambda-ARNs
  lambda_arns = { for k, v in aws_lambda_function.lambda : k => v.arn }

  # API Gateway Routen
  api_routes = {
    "GET /swaps" = "get_swaps"
    "GET /course-overrides" = "get_coursedateoverrides"
    "POST /swaps" = "create_swap"
    "PUT /swaps/{swapId}" = "update_swap"
    "DELETE /swaps/{swapId}" = "delete_swap"
    "POST /course-overrides" = "create_override"
    "PUT /course-overrides/{courseId}/{date}" = "update_override"
    "DELETE /course-overrides/{courseId}/{date}" = "delete_override"
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
