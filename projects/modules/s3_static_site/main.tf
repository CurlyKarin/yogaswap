resource "aws_s3_bucket" "spa" {
  bucket = var.bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_website_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  index_document {
    suffix = var.index_file
  }

  error_document {
    key = var.error_file
  }
}

resource "aws_s3_bucket_public_access_block" "spa" {
  bucket = aws_s3_bucket.spa.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "spa_oac" {
  bucket = aws_s3_bucket.spa.id
  policy = data.aws_iam_policy_document.allow_cloudfront_oac.json
}

data "aws_iam_policy_document" "allow_cloudfront_oac" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa.arn}/*"]

    condition {
      test     = "ArnEquals"
      variable = "AWS:SourceArn"
      values   = [var.cloudfront_distribution_arn]
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["https://${module.cloudfront_spa.distribution_url}", "http://localhost:5173"]
    max_age_seconds = 3000
  }
}
