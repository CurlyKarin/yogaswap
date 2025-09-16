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
      table_arns     = [module.dynamodb.swaps_table, module.dynamodb.course_overrides_table.table_arn]
      dynamodb_actions = var.lambdas["get_swaps"].dynamodb_actions
    },
    "get_coursedateoverrides" = {
      name           = var.lambdas["get_coursedateoverrides"].name
      file_name      = var.lambdas["get_coursedateoverrides"].file_name
      table_arns     = [module.dynamodb.swaps_table.table_arn]
      dynamodb_actions = var.lambdas["get_coursedateoverrides"].dynamodb_actions
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