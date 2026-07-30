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
    const tenantResp = await client.send(
      new GetItemCommand({
        TableName: tenantsTable,
        Key: { tenantId: { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const tenantItem = tenantResp.Item;
    if (!tenantItem) {
      // Unbekannte Subdomain / tenantId (#261) — kein stilles leeres Studio.
      // Kein HTTP 404: CloudFront mapped 404 → index.html (SPA), dann sieht das
      // Frontend keinen JSON-Fehler und zeigt weiter den Login.
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "tenant_not_found",
          tenantId,
          message: "Studio nicht gefunden",
        }),
      };
    }

    const tenant = unmarshall(tenantItem) as Tenant;

    // Membership nur bei bekanntem User (JWT / Authorizer); ohne Auth reicht Existenz-Check.
    let membership: UserTenantMembership | null = null;

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
        : null;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        tenantId,
        userId: userId ?? null,
        tenant,
        membership,
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
