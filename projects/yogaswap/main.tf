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
      s3_actions     = ["s3:GetObject", "s3:PutObject"]
      s3_resources   = ["arn:aws:s3:::my-bucket/*"]
    },
    "get_coursedateoverrides" = {
      name           = var.lambdas["get_coursedateoverrides"].name
      file_name      = var.lambdas["get_coursedateoverrides"].file_name
      table_arns     = [module.course_overrides_table.table_arn]
      dynamodb_actions = var.lambdas["get_coursedateoverrides"].dynamodb_actions
      tables = {
        "OVERRIDES_TABLE" = module.course_overrides_table.table_name
      }
      s3_actions     = ["s3:GetObject", "s3:PutObject"]
      s3_resources   = ["arn:aws:s3:::my-bucket/*"]
    }
  }
}


#resource "aws_apigatewayv2_api" "spa_api" {
#  name          = "YogaSwapAPI"
#  protocol_type = "HTTP"
#}

#resource "aws_apigatewayv2_integration" "get_swaps_integration" {
#  api_id           = aws_apigatewayv2_api.spa_api.id
#  integration_type = "AWS_PROXY"
#  integration_uri  = aws_lambda_function.getSwaps.arn
#  payload_format_version = "2.0"
#}

#resource "aws_apigatewayv2_route" "get_swaps_route" {
#  api_id    = aws_apigatewayv2_api.spa_api.id
#  route_key = "GET /swaps"
#  target    = "integrations/${aws_apigatewayv2_integration.get_swaps_integration.id}"
#}