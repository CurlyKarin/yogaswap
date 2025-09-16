
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
    Statement = [
      {
        Effect = "Allow",
        Action   = each.value.dynamodb_actions,
        Resource = each.value.table_arns
      },
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "get_swaps" {
  for_each = local.lambda_configs

  function_name     = "${var.project}-${each.value.name}"
  handler           = "index.handler"
  runtime           = "nodejs18.x"
  role              = aws_iam_role.lambda_role[each.key].arn
  filename          = "${path.module}/../../backend-code/lambdas/${each.value.file_name}"
  source_code_hash  = filebase64sha256("${path.module}/../../backend-code/lambdas/${each.value.file_name}")

  environment {
    variables = {
      SWAPS_TABLE  = module.swaps_table.table_name
      OVERRIDES_TABLE = module.course_overrides_table.table_name
    }
  }
}