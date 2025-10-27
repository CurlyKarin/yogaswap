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
