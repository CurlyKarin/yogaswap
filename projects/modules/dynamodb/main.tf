resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = var.hash_key
  range_key    = var.range_key

  dynamic "attribute" {
    for_each = var.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  dynamic "global_secondary_index" {
    for_each = var.global_secondary_index
    content {
      name            = global_secondary_index.value.name
      projection_type = global_secondary_index.value.projection_type

      key_schema {
        attribute_name = global_secondary_index.value.hash_key
        key_type       = "HASH"
      }
      dynamic "key_schema" {
        for_each = try(global_secondary_index.value.range_key, null) != null ? [1] : []
        content {
          attribute_name = global_secondary_index.value.range_key
          key_type       = "RANGE"
        }
      }
    }
  }
}

output "table_name" {
  value = aws_dynamodb_table.this.name
}

output "table_arn" {
  value = aws_dynamodb_table.this.arn
}
