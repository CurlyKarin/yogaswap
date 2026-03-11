import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import type { Tenant, UserTenantMembership } from "@yogaswap/shared";

const client = dynamoClient;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tenantsTable = process.env.TENANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;

  if (!tenantsTable || !membershipsTable) {
    console.error("TENANTS_TABLE or MEMBERSHIPS_TABLE env var is not set", {
      TENANTS_TABLE: tenantsTable,
      MEMBERSHIPS_TABLE: membershipsTable,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "TENANTS_TABLE or MEMBERSHIPS_TABLE env var is not set",
      }),
    };
  }

  const { tenantId, userId } = getTenantContext(event);

  if (!tenantId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing tenantId in context" }),
    };
  }

  try {
    // 1) Tenant laden
    const tenantResp = await client.send(
      new GetItemCommand({
        TableName: tenantsTable,
        Key: { tenantId: { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const tenantItem = tenantResp.Item;
    const tenant: Tenant | undefined = tenantItem
      ? (unmarshall(tenantItem) as Tenant)
      : undefined;

    // 2) Membership laden (falls userId vorhanden)
    let membership: UserTenantMembership | undefined;

    if (userId) {
      const membershipResp = await client.send(
        new GetItemCommand({
          TableName: membershipsTable,
          Key: {
            tenantId: { S: tenantId },
            userId: { S: userId },
          },
          ConsistentRead: true,
        }),
      );

      const membershipItem = membershipResp.Item;
      membership = membershipItem
        ? (unmarshall(membershipItem) as UserTenantMembership)
        : undefined;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        tenantId,
        userId: userId ?? null,
        tenant: tenant ?? null,
        membership: membership ?? null,
      }),
    };
  } catch (error) {
    console.error("Error in getTenantContext lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load tenant context" }),
    };
  }
};

