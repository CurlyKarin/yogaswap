terraform {
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
    }
  }
   # Map für Lambda-ARNs
  lambda_arns = { for k, v in aws_lambda_function.lambda : k => v.arn }

  # API Gateway Routen
  api_routes = {
    "GET /swaps" = "get_swaps"
    "GET /course-overrides" = "get_coursedateoverrides"
  }
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
