import { APIGatewayProxyEvent } from "aws-lambda";

export const DEFAULT_TENANT_ID = "default-tenant";

export type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

export function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  const userId =
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

