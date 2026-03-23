variable "name" { 
    type = string 
    description = "Name of the API Gateway"
}

variable "routes" {
  description = "Map von Routen zu Lambda-Namen"
  type        = map(string)
}

variable "lambda_arns" {
  description = "Map von Lambda-Namen zu ihren ARNs"
  type        = map(string)
}

variable "jwt_issuer" {
  description = "JWT issuer URL (z. B. Cognito User Pool issuer)"
  type        = string
  default     = ""
}

variable "jwt_audience" {
  description = "JWT audience (z. B. Cognito App Client ID)"
  type        = list(string)
  default     = []
}

variable "protected_routes" {
  description = "Routen, die JWT-Auth erzwingen (route_key-Format: 'METHOD /path')"
  type        = list(string)
  default     = []
}
