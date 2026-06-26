# Tenant-scoped: PK = tenantId, SK = user_swapId (user#swapId)
# GSI_From/GSI_To: PK = tenantId_user, SK = fromDate_... / toDate_...
module "swaps_table" {
  source    = "../modules/dynamodb"
  name      = "${local.project}-swaps-table"
  hash_key  = "tenantId"
  range_key = "user_swapId"

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
  source    = "../modules/dynamodb"
  name      = "${local.project}-courseOverrides-table"
  hash_key  = "tenantId"
  range_key = "courseId_date"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "courseId_date", type = "S" }
  ]
}

# Tenant-scoped: PK = tenantId, SK = courseId (string, z. B. "1", "2")
# GSI_CourseUid: Lookup tenantId + courseUid → Projektion ALL (UUID in API-Pfaden)
module "courses_table" {
  source    = "../modules/dynamodb"
  name      = "${local.project}-courses-table"
  hash_key  = "tenantId"
  range_key = "courseId"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "courseId", type = "S" },
    { name = "courseUid", type = "S" }
  ]
  global_secondary_index = [
    {
      name            = "GSI_CourseUid"
      hash_key        = "tenantId"
      range_key       = "courseUid"
      projection_type = "ALL"
    }
  ]
}

# -------------------------------------------------------------
# Multi-Tenancy / Settings Tabellen
# -------------------------------------------------------------

# Tenants: PK = tenantId
# Speichert z. B. Settings, Name, Impressum des Studios
module "tenants_table" {
  source   = "../modules/dynamodb"
  name     = "${local.project}-tenants-table"
  hash_key = "tenantId"
  attributes = [
    { name = "tenantId", type = "S" }
  ]
}

# Memberships: PK = tenantId, SK = userId (Nickname)
# Speichert die Rolle (admin, instructor, participant) des Users in diesem Tenant
module "memberships_table" {
  source    = "../modules/dynamodb"
  name      = "${local.project}-memberships-table"
  hash_key  = "tenantId"
  range_key = "userId"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "userId", type = "S" }
  ]
}

# Participants: PK = tenantId, SK = userId (Nickname)
# Speichert Teilnehmerprofil-Daten (optional E-Mail, Einladungsstatus, Settings)
module "participants_table" {
  source    = "../modules/dynamodb"
  name      = "${local.project}-participants-table"
  hash_key  = "tenantId"
  range_key = "userId"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "userId", type = "S" },
    { name = "userIdNormalized", type = "S" }
  ]
  global_secondary_index = [
    {
      name            = "GSI_UserIdNormalized"
      hash_key        = "tenantId"
      range_key       = "userIdNormalized"
      projection_type = "ALL"
    }
  ]
}

# Auth Tokens (Invite/Recovery): PK = tenantId, SK = token
# Speichert One-Time-Token inkl. Ablauf und usedAt (ohne TTL: wird serverseitig validiert).
module "auth_tokens_table" {
  source    = "../modules/dynamodb"
  name      = "${local.project}-auth-tokens-table"
  hash_key  = "tenantId"
  range_key = "token"
  attributes = [
    { name = "tenantId", type = "S" },
    { name = "token", type = "S" }
  ]
}

output "table_names" {
  value = [
    module.swaps_table.table_name,
    module.course_overrides_table.table_name,
    module.courses_table.table_name,
    module.tenants_table.table_name,
    module.memberships_table.table_name,
    module.participants_table.table_name,
    module.auth_tokens_table.table_name
  ]
}