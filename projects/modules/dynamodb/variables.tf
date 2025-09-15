
variable "name" {
  type = string
  description = "Name of the DynamoDB table"
}

variable "hash_key" {

}

variable "attributes" {
  type = list(object({
    name = string
    type = string
  }))
}