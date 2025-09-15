module "swaps_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-swaps"
  hash_key   = "user"
  range_key  = "fromDate_fromCourseId"

  # warum ???????????? nur Schlüssel???
  attributes = [
    { 
        name = "user", 
        type = "S" 
    },
    {
        name = "fromDate_fromCourseId"
        type = "S"
    }
  ]
  
  # Falls du später nach Zielkurs suchen willst
  global_secondary_index {
    name               = "toCourseIndex"
    hash_key           = "toCourseId"
    range_key          = "toDate"
    projection_type    = "ALL"
  }
  
}

module "courseOverrides_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-courseOverrides"
  hash_key   = "courseId"
  range_key  = "date"
  attributes = [
    {
        name = "courseId"
        type = "S"
    },
    {
        name = "date"
        type = "S"
    }
  ]
}

# Anlegen von Test Datensätzen
resource "aws_dynamodb_table_item" "example_swaps" {
  for_each = {
    v1 = jsonencode({ id = { S = "v1" }, type = { S = "car" }, brand = { S = "Toyota" }, year = { N = "2020" } })
    v2 = jsonencode({ id = { S = "v2" }, type = { S = "truck" }, brand = { S = "Volvo" }, year = { N = "2018" } })
    v3 = jsonencode({ id = { S = "v3" }, type = { S = "motorcycle" }, brand = { S = "BMW" }, year = { N = "2021" } })
  }

  table_name = module.swaps_table.table_name
  hash_key   = "user"
  range_key  = "fromDate"
  item       = each.value
}
