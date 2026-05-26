import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Swap } from "@yogaswap/shared";
import { loadTenantSettings } from "./tenantSettingsLoader";
import { loadCourseTimesByLegacyId, reconcilePendingSwapsPastOriginCutoff } from "./swapCutoffReconcile";

export async function applySwapCutoffReconcileIfConfigured(input: {
  client: DynamoDBClient;
  tenantId: string;
  swaps: Swap[];
}): Promise<Swap[]> {
  const { client, tenantId, swaps } = input;
  const swapsTable = process.env.SWAPS_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const coursesTable = process.env.COURSES_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  if (!swapsTable || !overridesTable || !coursesTable || !tenantsTable) {
    return swaps;
  }

  const pending = swaps.filter((s) => s.status === "pending");
  if (pending.length === 0) return swaps;

  const tenantSettings = await loadTenantSettings(client, tenantsTable, tenantId);
  const courseTimes = await loadCourseTimesByLegacyId(
    client,
    coursesTable,
    tenantId,
    pending.map((s) => s.fromCourseId),
  );

  return reconcilePendingSwapsPastOriginCutoff({
    client,
    swapsTable,
    overridesTable,
    tenantId,
    swaps,
    courseTimes,
    tenantSettings,
  });
}
