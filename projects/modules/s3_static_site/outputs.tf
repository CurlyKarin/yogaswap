output "bucket_name" {
  value = aws_s3_bucket.spa.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.spa.arn
}

output "bucket_regional_domain" {
  value = aws_s3_bucket.spa.bucket_regional_domain_name
}
