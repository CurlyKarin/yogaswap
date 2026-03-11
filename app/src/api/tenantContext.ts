import axios from "axios";
import type { Tenant, UserTenantMembership } from "shared/types";

export type TenantContextResponse = {
  tenantId: string;
  userId: string | null;
  tenant: Tenant | null;
  membership: UserTenantMembership | null;
};

export async function getTenantContext(user?: string): Promise<TenantContextResponse> {
  const response = await axios.get<TenantContextResponse>("/tenant-context", {
    params: user ? { user } : undefined,
  });
  return response.data;
}

