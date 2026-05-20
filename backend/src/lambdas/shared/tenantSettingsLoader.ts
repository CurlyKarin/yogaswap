import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { Tenant, TenantSettings } from "@yogaswap/shared";

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

/** Kopie von `shared/src/tenantSettings.ts` (resolveRollingExcludeLockWeeks). */
export function resolveRollingExcludeLockWeeks(settings?: TenantSettings): number {
  const value = settings?.excludeLockWeeks;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 52) {
    return value;
  }
  return 5;
}
