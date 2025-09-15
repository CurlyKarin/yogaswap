
resource "aws_lambda_function" "getSwaps" {
  function_name = "getSwaps"
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  role          = aws_iam_role.lambda_exec.arn
  filename      = "backend/lambdas/getSwaps.zip"
}