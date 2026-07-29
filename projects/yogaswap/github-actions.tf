# GitHub Actions OIDC-Rolle für CI/CD (#15 / #274).
#
# Account-weit: nur Workspace `prod` managed diese Ressourcen.
#
# Rechte-Modell (pragmatisch für tofu apply):
# - AWS managed PowerUserAccess → fast alle Service-APIs (S3, Cognito, API GW, …)
# - Inline-Policy nur für IAM (Lambda-Rollen, OIDC-Provider) — nicht in PowerUser enthalten
# Sicherheitsgrenze: OIDC Trust auf Repo CurlyKarin/yogaswap (nicht die Policy-Liste)

locals {
  manage_github_oidc = terraform.workspace == "prod"
  github_oidc_url    = "https://token.actions.githubusercontent.com"
  github_repo        = "CurlyKarin/yogaswap"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = local.manage_github_oidc ? 1 : 0

  url             = local.github_oidc_url
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

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
          "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:*"
        }
      }
    }]
  })
}

# Deckt S3/Lambda/DynamoDB/Cognito/API Gateway/CloudFront/SES/… für tofu apply.
resource "aws_iam_role_policy_attachment" "github_actions_poweruser" {
  count = local.manage_github_oidc ? 1 : 0

  role       = aws_iam_role.github_actions_deploy[0].name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# PowerUserAccess enthält kein IAM — nötig für Lambda-Rollen + OIDC-Provider.
resource "aws_iam_role_policy" "github_actions_iam" {
  count = local.manage_github_oidc ? 1 : 0

  name = "yogaswap-github-actions-iam"
  role = aws_iam_role.github_actions_deploy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
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
        Sid      = "Sts"
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = ["*"]
      },
    ]
  })
}

output "github_actions_role_arn" {
  value       = try(aws_iam_role.github_actions_deploy[0].arn, null)
  description = "ARN der GitHub-Actions-Deploy-Rolle (als Secret DEPLOY_ROLE_ARN in GitHub hinterlegen)"
}
