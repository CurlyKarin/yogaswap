terraform { 
    backend "local" {} 
} 

provider "aws" { 
    region = "eu-central-1" 
} 

# S3 Bucket 
resource "aws_s3_bucket" "spa" { 
    bucket = "yogaswap-demo-2025" 
    force_destroy = true 
} 

resource "aws_s3_bucket_public_access_block" "spa" { 
    bucket = aws_s3_bucket.spa.id 
    block_public_acls = false 
    block_public_policy = false 
    ignore_public_acls = false 
    restrict_public_buckets = false 
} 

# Ownership Controls für BucketOwnerEnforced 
resource "aws_s3_bucket_ownership_controls" "spa" { 
    bucket = aws_s3_bucket.spa.id 
    
    rule { 
        object_ownership = "ObjectWriter" 
    } 
} 

# Website-Konfiguration 
resource "aws_s3_bucket_website_configuration" "spa_site" { 
    bucket = aws_s3_bucket.spa.id 
    
    index_document { 
        suffix = "index.html" 
    } 
    
    error_document { 
        key = "index.html" 
    } 
} 

# SPA-Dateien hochladen 
resource "aws_s3_object" "spa_files" { 
    for_each = fileset("../../app/build", "**/*") 
    
    bucket = aws_s3_bucket.spa.id 
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

resource "aws_s3_bucket_policy" "spa_public" { 
    bucket = aws_s3_bucket.spa.id 
    policy = jsonencode({ 
        Version = "2012-10-17" 
        Statement = [{ 
            Effect = "Allow" 
            Principal = "*" 
            Action = ["s3:GetObject"] 
            Resource = "${aws_s3_bucket.spa.arn}/*" 
        }] 
    })

    depends_on = [aws_s3_bucket_public_access_block.spa]
} 

output "spa_url" { 
    value = aws_s3_bucket_website_configuration.spa_site.website_endpoint 
    description = "URL zum Demo-YogaSwap" 
}