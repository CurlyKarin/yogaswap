
module "spa_site" {
  source      = "../modules/s3_static_site"
  bucket_name = "${var.project}-site"
  cloudfront_distribution_arn = module.cloudfront_spa.distribution_arn
  index_file  = "index.html"
  error_file  = "index.html"
  enable_website_hosting = true
}

# Kopieren der Inhalte für die webpage ins bucket

resource "aws_s3_object" "spa_files" {
  for_each = fileset("../../app/build", "**/*") 

  bucket = module.spa_site.bucket_name
  key = each.value 
    source = "../../app/build/${each.value}" 
    etag         = filemd5("../../app/build/${each.value}")
    content_type = lookup({
    html = "text/html",
    js   = "application/javascript",
    css  = "text/css",
    json = "application/json",
    png  = "image/png",
    jpg  = "image/jpeg",
    svg  = "image/svg+xml"
  }, regex("\\.([^.]+)$", each.value)[0], "binary/octet-stream")
}
