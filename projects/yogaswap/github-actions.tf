# GitHub Actions OIDC-Rolle für CI/CD (#15).
#
# Account-weit (wie SES-Domain-Identity): nur Workspace `prod` managed diese
# Ressourcen, damit kein Workspace-Konflikt entsteht.
#
# Ablauf:
# 1) tofu workspace select prod && tofu apply
# 2) Output `github_actions_role_arn` in GitHub-Secret DEPLOY_ROLE_ARN eintragen
# 3) Workflow-Datei .github/workflows/deploy-staging.yml anlegen (siehe #15)

locals {
  manage_github_oidc = terraform.workspace == "prod"

  # GitHub OIDC Issuer (konstant, kein eigener Lookup nötig).
  github_oidc_url = "https://token.actions.githubusercontent.com"

  # Nur dieses Repo darf die Rolle annehmen.
  github_repo = "CurlyKarin/yogaswap"
}

# Einmaliger OIDC-Provider pro AWS-Account.
# count = 0 in allen Workspaces außer prod → keine doppelten Ressourcen.
resource "aws_iam_openid_connect_provider" "github" {
  count = local.manage_github_oidc ? 1 : 0

  url = local.github_oidc_url

  # Client-ID ist für GitHub Actions immer "sts.amazonaws.com".
  client_id_list = ["sts.amazonaws.com"]

  # Thumbprint des GitHub OIDC Root-Zertifikats (stabil; AWS verifiziert zusätzlich via URL).
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# IAM-Rolle, die der GitHub-Runner per OIDC annimmt.
resource "aws_iam_role" "github_actions_deploy" {
  count = local.manage_github_oidc ? 1 : 0

  name        = "yogaswap-github-actions-deploy"
  description = "Rolle fuer GitHub Actions CI/CD Deploy (#15)"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "GitHubActionsOIDC"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github[0].arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Erlaubt: alle Branches + PR-Checks im Repo.
          # Deploy-Workflow schränkt selbst auf main ein (environment: protection).
          "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:*"
        }
      }
    }]
  })
}

# Deploy-Policy: alle Rechte, die tofu apply + Frontend-Deploy benötigt.
resource "aws_iam_role_policy" "github_actions_deploy" {
  count = local.manage_github_oidc ? 1 : 0

  name = "yogaswap-github-actions-deploy"
  role = aws_iam_role.github_actions_deploy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Deploy"
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:PutObject", "s3:DeleteObject",
          "s3:ListBucket", "s3:GetBucketLocation",
          "s3:GetBucketPolicy", "s3:PutBucketPolicy",
          "s3:GetBucketWebsite", "s3:PutBucketWebsite",
          "s3:GetBucketVersioning", "s3:PutBucketVersioning",
          "s3:GetBucketAcl", "s3:PutBucketAcl",
          "s3:GetBucketCORS", "s3:PutBucketCORS",
          "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock",
          "s3:CreateBucket", "s3:DeleteBucket",
          "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
          "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration",
          "s3:GetBucketOwnershipControls", "s3:PutBucketOwnershipControls",
          "s3:GetBucketLogging",
          "s3:GetBucketTagging", "s3:PutBucketTagging",
          "s3:GetBucketRequestPayment",
          "s3:GetObjectTagging",
        ]
        Resource = ["arn:aws:s3:::*"]
      },
      {
        Sid    = "CloudFront"
        Effect = "Allow"
        Action = [
          "cloudfront:GetDistribution", "cloudfront:GetDistributionConfig",
          "cloudfront:CreateDistribution", "cloudfront:UpdateDistribution",
          "cloudfront:DeleteDistribution",
          "cloudfront:CreateInvalidation", "cloudfront:GetInvalidation",
          "cloudfront:ListDistributions",
          "cloudfront:TagResource", "cloudfront:UntagResource", "cloudfront:ListTagsForResource",
          "cloudfront:GetOriginAccessControl", "cloudfront:CreateOriginAccessControl",
          "cloudfront:UpdateOriginAccessControl", "cloudfront:DeleteOriginAccessControl",
          "cloudfront:ListOriginAccessControls",
          "cloudfront:GetCachePolicy", "cloudfront:CreateCachePolicy",
          "cloudfront:UpdateCachePolicy", "cloudfront:DeleteCachePolicy",
          "cloudfront:ListCachePolicies",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "Lambda"
        Effect = "Allow"
        Action = [
          "lambda:GetFunction", "lambda:CreateFunction", "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration", "lambda:DeleteFunction",
          "lambda:ListFunctions", "lambda:GetFunctionConfiguration",
          "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy",
          "lambda:ListVersionsByFunction", "lambda:PublishVersion",
          "lambda:GetFunctionCodeSigningConfig",
          "lambda:ListTags", "lambda:TagResource", "lambda:UntagResource",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "DynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeTable", "dynamodb:CreateTable", "dynamodb:DeleteTable",
          "dynamodb:UpdateTable", "dynamodb:ListTables",
          "dynamodb:DescribeTimeToLive", "dynamodb:UpdateTimeToLive",
          "dynamodb:DescribeContinuousBackups", "dynamodb:UpdateContinuousBackups",
          "dynamodb:ListTagsOfResource", "dynamodb:TagResource", "dynamodb:UntagResource",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "Cognito"
        Effect = "Allow"
        Action = [
          "cognito-idp:DescribeUserPool", "cognito-idp:CreateUserPool",
          "cognito-idp:UpdateUserPool", "cognito-idp:DeleteUserPool",
          "cognito-idp:CreateUserPoolClient", "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:UpdateUserPoolClient", "cognito-idp:DeleteUserPoolClient",
          "cognito-idp:ListUserPoolClients",
          "cognito-idp:CreateUserPoolDomain", "cognito-idp:DescribeUserPoolDomain",
          "cognito-idp:DeleteUserPoolDomain",
          "cognito-idp:ListTagsForResource", "cognito-idp:TagResource", "cognito-idp:UntagResource",
          "cognito-idp:SetUserPoolMfaConfig", "cognito-idp:GetUserPoolMfaConfig",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "IAMRolesForLambda"
        Effect = "Allow"
        Action = [
          "iam:GetRole", "iam:CreateRole", "iam:DeleteRole",
          "iam:UpdateRole", "iam:UpdateRoleDescription",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy",
          "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
          "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
          "iam:PassRole",
          "iam:ListInstanceProfilesForRole",
          "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "SES"
        Effect = "Allow"
        Action = [
          "ses:GetEmailIdentity", "ses:CreateEmailIdentity", "ses:DeleteEmailIdentity",
          "ses:PutEmailIdentityDkimAttributes",
          "ses:GetEmailIdentityPolicies", "ses:CreateEmailIdentityPolicy",
          "ses:UpdateEmailIdentityPolicy", "ses:DeleteEmailIdentityPolicy",
          "ses:ListEmailIdentities",
          # Ältere SES v1 API (für aws_ses_domain_identity in Terraform):
          "ses:GetIdentityVerificationAttributes",
          "ses:GetIdentityDkimAttributes",
          "ses:SetIdentityMailFromDomain",
          "ses:PutIdentityPolicy", "ses:GetIdentityPolicies", "ses:DeleteIdentityPolicy",
          "ses:ListIdentities",
          "ses:VerifyDomainIdentity", "ses:VerifyDomainDkim",
          "ses:DeleteIdentity",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "IAMOIDCProvider"
        Effect = "Allow"
        Action = [
          "iam:GetOpenIDConnectProvider",
          "iam:CreateOpenIDConnectProvider",
          "iam:UpdateOpenIDConnectProviderThumbprint",
          "iam:DeleteOpenIDConnectProvider",
          "iam:AddClientIDToOpenIDConnectProvider",
          "iam:RemoveClientIDFromOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider", "iam:UntagOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviderTags",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "TerraformState"
        Effect = "Allow"
        Action = [
          "sts:GetCallerIdentity",
        ]
        Resource = ["*"]
      },
    ]
  })
}

output "github_actions_role_arn" {
  value       = try(aws_iam_role.github_actions_deploy[0].arn, null)
  description = "ARN der GitHub-Actions-Deploy-Rolle (als Secret DEPLOY_ROLE_ARN in GitHub hinterlegen)"
}
