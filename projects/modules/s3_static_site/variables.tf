variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket"
}

variable "index_file"  { 
  type = string 
}

variable "error_file"  { 
  type = string 
}

variable "cloudfront_distribution_arn" {
  description = "ARN der CloudFront-Distribution zur OAC-Freigabe"
  type        = string
  default     = null
}

variable "enable_website_hosting" {
  description = "Ob S3 als Website (index.html) konfiguriert wird"
  type        = bool
  default     = true
}