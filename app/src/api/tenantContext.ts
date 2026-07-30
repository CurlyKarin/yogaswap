import axios from "axios";
import type { Tenant, UserTenantMembership } from "shared/types";

export type TenantContextResponse = {
  tenantId: string;
  userId: string | null;
  tenant: Tenant;
  membership: UserTenantMembership | null;
};

export class TenantNotFoundError extends Error {
  readonly tenantId: string;

  constructor(tenantId: string, message = "Studio nicht gefunden") {
    super(message);
    this.name = "TenantNotFoundError";
    this.tenantId = tenantId;
  }
}

export async function getTenantContext(user?: string): Promise<TenantContextResponse> {
  try {
    const response = await axios.get<TenantContextResponse>("/tenant-context", {
      params: user ? { user } : undefined,
    });
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const data = err.response.data as
        | { error?: string; tenantId?: string; message?: string }
        | undefined;
      // 400 (CloudFront-safe) oder 404 — beides als „Studio fehlt“ werten.
      if (
        data?.error === "tenant_not_found" ||
        status === 404
      ) {
        const tenantId =
          (typeof data?.tenantId === "string" && data.tenantId) ||
          (axios.defaults.headers.common["x-tenant-id"] as string | undefined) ||
          "unbekannt";
        throw new TenantNotFoundError(
          tenantId,
          typeof data?.message === "string" ? data.message : "Studio nicht gefunden",
        );
      }
    }
    throw err;
  }
}
