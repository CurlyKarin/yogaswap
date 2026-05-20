import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { Tenant, TenantSettings } from "@yogaswap/shared";
import {
  validateStudioSettingsPatch,
  type StudioSettingsPatch,
} from "../shared/studioSettingsValidation";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

const MVP_SETTINGS_KEYS = [
  "inactiveGraceDaysAfterCourseEnd",
  "minOffsetDays",
  "maxOffsetDays",
] as const;

function parseBody(event: APIGatewayProxyEvent): StudioSettingsPatch | null {
  if (!event.body) return null;
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as StudioSettingsPatch;
  } catch {
    return null;
  }
}

function mergeTenantSettings(
  existing: TenantSettings | undefined,
  patch: StudioSettingsPatch,
): TenantSettings {
  const next: TenantSettings = { ...(existing ?? {}) };
  for (const key of MVP_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      (next as Record<string, number>)[key] = patch[key] as number;
    }
  }
  return next;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tenantsTable = process.env.TENANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  if (!tenantsTable || !membershipsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "TENANTS_TABLE or MEMBERSHIPS_TABLE env var is not set",
      }),
    };
  }

  const body = parseBody(event);
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (
    !Object.prototype.hasOwnProperty.call(body, "name") &&
    !MVP_SETTINGS_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key))
  ) {
    return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields provided" }) };
  }

  const validationError = validateStudioSettingsPatch(body);
  if (validationError) {
    return { statusCode: 400, body: JSON.stringify({ error: validationError }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
    const membershipResp = await client.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: actorUserId },
        },
        ConsistentRead: true,
      }),
    );
    if (membershipResp.Item?.role?.S !== "admin") {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const tenantResp = await client.send(
      new GetItemCommand({
        TableName: tenantsTable,
        Key: { tenantId: { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    if (!tenantResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Tenant not found" }) };
    }

    const existing = unmarshall(tenantResp.Item) as Tenant;
    const nextName = Object.prototype.hasOwnProperty.call(body, "name")
      ? body.name!.trim()
      : existing.name;
    const nextSettings = mergeTenantSettings(existing.settings, body);

    const item: Tenant = {
      tenantId: existing.tenantId,
      name: nextName,
      settings: nextSettings,
    };

    await client.send(
      new PutItemCommand({
        TableName: tenantsTable,
        Item: marshall(item, { removeUndefinedValues: true }),
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify(item),
    };
  } catch (error) {
    console.error("Error updating tenant settings:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to update tenant settings" }) };
  }
};
