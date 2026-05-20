import axios from "axios";
import type { Tenant } from "shared/types";
import type { StudioSettingsPatch } from "shared/tenantSettings";

function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const backendError =
      typeof error.response?.data?.error === "string" ? error.response.data.error : undefined;
    return backendError ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function updateTenantSettings(patch: StudioSettingsPatch): Promise<Tenant> {
  try {
    const response = await axios.put<Tenant>("/tenant-settings", patch);
    return response.data;
  } catch (error) {
    throw new Error(apiErrorMessage(error, "Studio-Einstellungen konnten nicht gespeichert werden."));
  }
}
