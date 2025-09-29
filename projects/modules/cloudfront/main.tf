variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket"
}

variable "bucket_domain_name" {
  type        = string
  description = "The regional domain name of the S3 bucket (used with CloudFront OAC)"
}

variable "api_gateway_domain_name" {
  type = string
}

resource "aws_cloudfront_origin_access_control" "spa" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for S3 static site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  # Origin API Gateway
  origin {
    domain_name = var.api_gateway_domain_name
    origin_id   = "api-gateway-backend"

    custom_origin_config {
      origin_protocol_policy = "https-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Origin: S3 Static Site
  origin {
    domain_name = var.bucket_domain_name
    origin_id   = "s3-site-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id
  }

  # API Gateway
  ordered_cache_behavior {
    path_pattern     = "/swaps*" # "/swaps"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "DELETE", "PATCH"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "api-gateway-backend"

    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }
    compress = true
  }
  ordered_cache_behavior {
  path_pattern     = "/course-overrides*"
  allowed_methods  = ["GET", "HEAD", "OPTIONS"]
  cached_methods   = ["GET", "HEAD"]
  target_origin_id = "api-gateway-backend"
  viewer_protocol_policy = "redirect-to-https"
  forwarded_values {
    query_string = true
    cookies {
      forward = "none"
    }
  }
  compress = true
}

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-site-origin"

    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "${var.bucket_name}-cloudfront"
  }

  #depends_on = [aws_cloudfront_origin_access_control.spa]
}

output "distribution_id" {
  value       = aws_cloudfront_distribution.spa.id
  description = "ID der CloudFront Distribution"
}

output "distribution_arn" {
  value       = aws_cloudfront_distribution.spa.arn
  description = "ARN der CloudFront Distribution"
}

output "distribution_url" {
  value       = aws_cloudfront_distribution.spa.domain_name
  description = "Die URL, unter der die SPA via CloudFront erreichbar ist"
}
