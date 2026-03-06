# Tenant-scoped: PK = tenantId, SK = user_swapId (user#swapId)
# GSI_From/GSI_To: PK = tenantId_user, SK = fromDate_... / toDate_...
module "swaps_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-swaps-table"
  hash_key   = "tenantId"
  range_key  = "user_swapId"

  attributes = [
    { name = "tenantId", type = "S" },
    { name = "user_swapId", type = "S" },
    { name = "tenantId_user", type = "S" },
    { name = "fromDate_fromCourseId_status", type = "S" },
    { name = "toDate_toCourseId_status", type = "S" }
  ]

  global_secondary_index = [
    {
      name            = "GSI_From"
      hash_key        = "tenantId_user"
      range_key       = "fromDate_fromCourseId_status"
      projection_type = "ALL"
    },
    {
      name            = "GSI_To"
      hash_key        = "tenantId_user"
      range_key       = "toDate_toCourseId_status"
      projection_type = "ALL"
    }
  ]
}

# Tenant-scoped: PK = tenantId, SK = courseId_date (courseId_date)
module "course_overrides_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-courseOverrides-table"
  hash_key   = "tenantId"
  range_key  = "courseId_date"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "courseId_date", type = "S" }
  ]
}

# Tenant-scoped: PK = tenantId, SK = courseId (string, z. B. "1", "2")
module "courses_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-courses-table"
  hash_key   = "tenantId"
  range_key  = "courseId"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "courseId", type = "S" }
  ]
}

output "table_names" {
  value = [
    module.swaps_table.table_name,
    module.course_overrides_table.table_name,
    module.courses_table.table_name
  ]
}