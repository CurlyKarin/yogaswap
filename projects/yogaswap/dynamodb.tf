module "swaps_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-swaps-table"
  hash_key   = "user"
  range_key  = "swapId"

  attributes = [
    { name = "user", type = "S" },
    { name = "swapId", type = "S" },
    { name = "fromDate_fromCourseId_status", type = "S" },
    { name = "toDate_toCourseId_status", type = "S" }
  ]
  
  global_secondary_index = [
    {
      name            = "GSI_From"
      hash_key        = "user"
      range_key       = "fromDate_fromCourseId_status"
      projection_type = "ALL"
    },
    {
      name            = "GSI_To"
      hash_key        = "user"
      range_key       = "toDate_toCourseId_status"
      projection_type = "ALL"
    }
  ]
  
}

module "course_overrides_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-courseOverrides-table"
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

output "table_names" {
  value = [
    module.swaps_table.table_name,
    module.course_overrides_table.table_name
  ]
}