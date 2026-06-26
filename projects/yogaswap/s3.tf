
module "spa_site" {
  source                      = "../modules/s3_static_site"
  bucket_name                 = "${local.project}-site"
  cloudfront_distribution_arn = module.cloudfront_spa.distribution_arn
  index_file                  = "index.html"
  error_file                  = "index.html"
  enable_website_hosting      = true
}

resource "null_resource" "upload_frontend" {
  triggers = {
    build_hash = local.build_hash
  }

  provisioner "local-exec" {
    command = "aws s3 sync ../../app/build s3://${module.spa_site.bucket_name} --delete"
  }
}

# Kopieren der Inhalte für die webpage ins bucket
resource "aws_s3_object" "spa_files" {
  for_each = fileset("../../app/build", "**/*")

  bucket = module.spa_site.bucket_name
  key    = each.value
  source = "../../app/build/${each.value}"
  etag   = filemd5("../../app/build/${each.value}")
  content_type = lookup({
    html = "text/html",
    js   = "application/javascript",
    css  = "text/css",
    json = "application/json",
    png  = "image/png",
    jpg  = "image/jpeg",
    svg  = "image/svg+xml"
  }, regex("\\.([^.]+)$", each.value)[0], "binary/octet-stream")

  # SPA-Cache-Strategie:
  # - index.html immer frisch pruefen
  # - versionierte Assets aggressiv cachen
  cache_control = each.value == "index.html" ? "no-cache, must-revalidate" : "public, max-age=31536000, immutable"

  # Debugging: Logge hochgeladene Dateien
  provisioner "local-exec" {
    command = "echo 'Uploading ${each.value} to S3 bucket ${module.spa_site.bucket_name}'"
  }

  depends_on = [
    null_resource.upload_frontend,
  ]
}
