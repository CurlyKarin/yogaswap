import { resolveTenantAppBaseUrl } from "@yogaswap/shared";

/**
 * App-Basis-URL für Mail-/Invite-Links (#249).
 * - Ohne TENANT_BASE_HOST: immer BASE_URL (demo/staging/apex).
 * - Mit TENANT_BASE_HOST=app.yogaswap.de: Studio → https://{tenant}.app.yogaswap.de,
 *   default-tenant → BASE_URL (https://app.yogaswap.de).
 */
export function resolveAppBaseUrlForTenant(tenantId: string): string {
  const apexBaseUrl = process.env.BASE_URL || "";
  const multiTenantParentHost = process.env.TENANT_BASE_HOST?.trim() || undefined;
  return resolveTenantAppBaseUrl(tenantId, {
    apexBaseUrl,
    multiTenantParentHost,
  });
}
