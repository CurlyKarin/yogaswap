
variable "name" {
  type = string
  description = "Name of the DynamoDB table"
}

variable "hash_key" {
  type = string
}

variable "range_key" {
  type = string
  default = null
}

variable "global_secondary_index" {
  type = list(object({
    name               = string
    hash_key           = string
    range_key          = optional(string)
    projection_type    = string
  }))
  default = []
}

variable "attributes" {
  type = list(object({
    name = string
    type = string
  }))
}