import { APIGatewayProxyEvent } from "aws-lambda";

export const DEFAULT_TENANT_ID = "default-tenant";

export type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

export function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  // Bevorzugt den Nickname aus JWT-Claims (Cognito HTTP API v2),
  // fällt sonst auf principalId oder Query-Param "user" zurück.
  const claims = (event.requestContext as any)?.authorizer?.jwt?.claims;
  const nicknameFromJwt = claims?.nickname as string | undefined;

  const userId =
    nicknameFromJwt ??
    event.requestContext?.authorizer?.principalId ??
    event.queryStringParameters?.user ??
    null;

  const headers = event.headers || {};
  const tenantId =
    (headers["x-tenant-id"] as string | undefined) ??
    (headers["X-Tenant-ID"] as string | undefined) ??
    DEFAULT_TENANT_ID;

  return {
    tenantId,
    userId: userId ?? undefined,
  };
}

