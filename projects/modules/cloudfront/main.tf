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

variable "aliases" {
  type        = list(string)
  description = "Alternate domain names (CNAMEs) for the CloudFront distribution (e.g. app.yogaswap.de)"
  default     = []
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN (must be in us-east-1) to use for aliases. Leave empty to use CloudFront default cert."
  default     = ""
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

  aliases = var.aliases

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
    path_pattern     = "/tenant-context*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "api-gateway-backend"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
      headers = [
        "Authorization",
        "x-tenant-id",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }
    compress = true
  }
  ordered_cache_behavior {
    path_pattern     = "/tenant-settings*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "api-gateway-backend"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
      headers = [
        "Authorization",
        "x-tenant-id",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }
    compress = true
  }
  ordered_cache_behavior {
    path_pattern     = "/course-overrides*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"]
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
    path_pattern     = "/process-promotions*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"]
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
    path_pattern     = "/process-ring-swaps*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"]
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
    path_pattern     = "/courses*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "api-gateway-backend"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
      headers = [
        "Authorization",
        "x-tenant-id",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }
    compress = true
  }

  ordered_cache_behavior {
    path_pattern     = "/participants*"
    target_origin_id = "api-gateway-backend"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies { 
        forward = "none" 
      }
      headers = [
        "Authorization",
        "x-tenant-id",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }

    compress = true
  }

  # Public Auth Endpoint (self-service reset request)
  ordered_cache_behavior {
    path_pattern     = "/auth/password-reset/request*"
    target_origin_id = "api-gateway-backend"
    allowed_methods  = ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
      headers = [
        "x-tenant-id",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }

    compress = true
  }

  # Public Auth Endpoint (token -> Cognito code)
  ordered_cache_behavior {
    path_pattern     = "/auth/password-reset/from-token*"
    target_origin_id = "api-gateway-backend"
    # CloudFront erlaubt hier nur vordefinierte Sets:
    # - [HEAD, GET] oder [HEAD, GET, OPTIONS] oder das "Full"-Set inkl. POST/PUT/PATCH/DELETE.
    allowed_methods  = ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
      headers = [
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
      ]
    }

    compress = true
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-site-origin"

    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 0
  }

  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn != "" ? [1] : []
    content {
      acm_certificate_arn            = var.acm_certificate_arn
      ssl_support_method             = "sni-only"
      minimum_protocol_version       = "TLSv1.2_2021"
      cloudfront_default_certificate = false
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "${var.bucket_name}-cloudfront"
  }
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
