
resource "aws_iam_role" "lambda_role" {
  for_each = local.lambda_configs

  name = "${var.project}-${each.value.name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  for_each = local.lambda_configs

  role = aws_iam_role.lambda_role[each.key].name

  # Actions unbedingt erweitern, bei Änderungen im Lambda code
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = concat(
      # DynamoDB-Berechtigungen, falls dynamodb_actions nicht leer
      length(each.value.dynamodb_actions) > 0 ? [{
        Effect   = "Allow",
        Action   = each.value.dynamodb_actions,
        Resource = each.value.table_arns
      }] : [],
      # S3-Berechtigungen, falls s3_actions nicht leer
      length(each.value.s3_actions) > 0 ? [{
        Effect   = "Allow",
        Action   = each.value.s3_actions,
        Resource = each.value.s3_resources
      }] : [],
      # CloudWatch Logs-Berechtigungen
      # Action = ["logs:*"], ???
      [{
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }],
      try(each.value.additional_policies, [])
    )
  })
}

resource "aws_lambda_function" "lambda" {
  for_each = local.lambda_configs

  function_name     = "${var.project}-${each.value.name}"
  handler           = "index.handler"
  runtime           = "nodejs18.x"
  role              = aws_iam_role.lambda_role[each.key].arn
  filename          = "${path.module}/../../backend/zips/${each.value.file_name}"
  source_code_hash  = filebase64sha256("${path.module}/../../backend/zips/${each.value.file_name}")

  dynamic "environment" {
    for_each = length(merge(each.value.tables, try(each.value.environment, {}))) > 0 ? [1] : []
    content {
      variables = merge(
        each.value.tables,
        try(each.value.environment, {})
      )
    }
  }
}

output "lambda_arns" {
  value = { for k, v in aws_lambda_function.lambda : k => v.arn }
}