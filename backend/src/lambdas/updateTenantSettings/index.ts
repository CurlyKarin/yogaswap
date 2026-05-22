import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { Tenant, TenantSettings } from "@yogaswap/shared";
import {
  findHorizonShrinkBlockers,
  horizonShrinkBlockedErrorMessage,
} from "../shared/horizonShrinkGuard";
import {
  validateStudioSettingsPatch,
  type StudioSettingsPatch,
} from "../shared/studioSettingsValidation";
import { resolveRollingPlanningHorizonWeeks } from "../shared/tenantSettingsLoader";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

const MVP_SETTINGS_KEYS = [
  "inactiveGraceDaysAfterCourseEnd",
  "minOffsetDays",
  "maxOffsetDays",
  "rollingPlanningHorizonWeeks",
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

function hasUpdatablePatch(patch: StudioSettingsPatch): boolean {
  return (
    Object.prototype.hasOwnProperty.call(patch, "name") ||
    MVP_SETTINGS_KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key))
  );
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tenantsTable = process.env.TENANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const coursesTable = process.env.COURSES_TABLE;
  const swapsTable = process.env.SWAPS_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  if (!tenantsTable || !membershipsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "TENANTS_TABLE or MEMBERSHIPS_TABLE env var is not set",
      }),
    };
  }
  if (!coursesTable || !swapsTable || !overridesTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "COURSES_TABLE, SWAPS_TABLE or OVERRIDES_TABLE env var is not set",
      }),
    };
  }

  const body = parseBody(event);
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!hasUpdatablePatch(body)) {
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

    if (Object.prototype.hasOwnProperty.call(body, "rollingPlanningHorizonWeeks")) {
      const currentWeeks = resolveRollingPlanningHorizonWeeks(existing.settings);
      const nextWeeks = body.rollingPlanningHorizonWeeks!;
      if (nextWeeks < currentWeeks) {
        const blockers = await findHorizonShrinkBlockers(client, {
          tenantId,
          coursesTable,
          swapsTable,
          overridesTable,
          currentWeeks,
          nextWeeks,
        });
        if (blockers) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: horizonShrinkBlockedErrorMessage(blockers) }),
          };
        }
      }
    }

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
