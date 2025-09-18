module "swaps_table" {
  source     = "../modules/dynamodb"
  name       = "${var.project}-swaps-table"
  hash_key   = "user"
  range_key  = "fromDate_fromCourseId"

  attributes = [
    { 
        name = "user", 
        type = "S" 
    },
    {
        name = "fromDate_fromCourseId"
        type = "S"
    }#,
    #{
    #  name = "toCourseId"
    #  type = "S"
    #},
    #{
    #  name = "toDate"
    #  type = "S"
    #}
  ]
  
  # Falls du später nach Zielkurs suchen willst
  #global_secondary_index {
  #  name               = "toCourseIndex"
  #  hash_key           = "toCourseId"
  #  range_key          = "toDate"
  #  projection_type    = "ALL"
  #}
  
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

#output "table_names" {
#  value = [
#    module.swaps_table.table_name,
#    module.course_overrides_table.table_name
#  ]
#}