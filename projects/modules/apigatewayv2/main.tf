resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*", "http://localhost:5173"]
    allow_methods = ["GET", "POST", "OPTIONS", "PUT", "DELETE"]
    allow_headers = ["Content-Type"]
    max_age       = 300
  }
}

locals {
  use_jwt_authorizer = var.jwt_issuer != "" && length(var.jwt_audience) > 0
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  count = local.use_jwt_authorizer ? 1 : 0

  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name}-jwt-authorizer"

  jwt_configuration {
    issuer   = var.jwt_issuer
    audience = var.jwt_audience
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = var.routes

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_arns[each.value]
  integration_method = "POST" # AWS_PROXY verwendet POST
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "this" {
  for_each = var.routes

  api_id    = aws_apigatewayv2_api.this.id
  #route_key = "${each.value.method} ${each.key}"
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.lambda[each.key].id}"
  authorization_type = local.use_jwt_authorizer && contains(var.protected_routes, each.key) ? "JWT" : "NONE"
  authorizer_id      = local.use_jwt_authorizer && contains(var.protected_routes, each.key) ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

resource "aws_lambda_permission" "apigw" {
  for_each = var.routes

  statement_id  = "AllowExecutionFromAPIGateway-${each.value}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_arns[each.value]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.this.api_endpoint
}

output "url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}
