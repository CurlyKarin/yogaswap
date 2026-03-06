import type { APIGatewayProxyEvent } from "aws-lambda";
import { DEFAULT_TENANT_ID } from "@yogaswap/shared";
import type { TenantContext } from "@yogaswap/shared";

/**
 * Liest tenantId und userId aus dem API-Gateway-Event.
 * Bis Multi-Tenancy aktiv ist: tenantId = DEFAULT_TENANT_ID.
 * userId aus authorizer.principalId oder query-Param "user".
 */
export function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  const userId =
    event.requestContext?.authorizer?.principalId ??
    event.queryStringParameters?.user ??
    null;

  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: userId ?? undefined,
  };
}
