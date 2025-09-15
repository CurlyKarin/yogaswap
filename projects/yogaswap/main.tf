provider "aws" { 
    region = "eu-central-1" 
}

resource "aws_apigatewayv2_api" "spa_api" {
  name          = "YogaSwapDemoAPI"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "get_swaps_integration" {
  api_id           = aws_apigatewayv2_api.spa_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.getSwaps.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_swaps_route" {
  api_id    = aws_apigatewayv2_api.spa_api.id
  route_key = "GET /swaps"
  target    = "integrations/${aws_apigatewayv2_integration.get_swaps_integration.id}"
}