import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { Tenant, TenantSettings } from "@yogaswap/shared";

export const DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS = 5;

export async function loadTenantSettings(
  client: DynamoDBClient,
  tenantsTable: string,
  tenantId: string,
): Promise<TenantSettings | undefined> {
  const resp = await client.send(
    new GetItemCommand({
      TableName: tenantsTable,
      Key: { tenantId: { S: tenantId } },
      ConsistentRead: true,
    }),
  );
  if (!resp.Item) return undefined;
  const tenant = unmarshall(resp.Item) as Tenant;
  return tenant.settings;
}

/** Studio-Anzeigename für Auth-Mails (#268). Fehlt Tabelle/Eintrag → undefined (Template-Fallback). */
export async function loadTenantName(
  client: DynamoDBClient,
  tenantsTable: string | undefined,
  tenantId: string,
): Promise<string | undefined> {
  if (!tenantsTable?.trim() || !tenantId.trim()) return undefined;
  try {
    const resp = await client.send(
      new GetItemCommand({
        TableName: tenantsTable,
        Key: { tenantId: { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    if (!resp?.Item) return undefined;
    const tenant = unmarshall(resp.Item) as Tenant;
    const name = tenant.name?.trim();
    return name || undefined;
  } catch (err) {
    console.warn("Could not load tenant name for mail templates:", err);
    return undefined;
  }
}

/** Kopie von `shared/src/tenantSettings.ts` (resolveRollingPlanningHorizonWeeks). */
export function resolveRollingPlanningHorizonWeeks(settings?: TenantSettings): number {
  const value = settings?.rollingPlanningHorizonWeeks;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 52) {
    return value;
  }
  return DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS;
}
