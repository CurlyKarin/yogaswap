import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  type Tenant,
  type ParticipantProfile,
  type ParticipantStatus,
  type UserTenantMembership,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canManageParticipants } from "../shared/permissions";
import { deriveParticipantStatus } from "../shared/participantStatus";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

type ParticipantListItem = ParticipantProfile & {
  status: ParticipantStatus;
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  if (!tableName) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "PARTICIPANTS_TABLE env var is not set" }),
    };
  }
  if (!membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "MEMBERSHIPS_TABLE or TENANTS_TABLE env var is not set" }),
    };
  }

  const { tenantId, userId } = getTenantContext(event);
  const search = (event.queryStringParameters?.search || "").trim().toLowerCase();
  if (!userId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
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
    const membership = membershipResp.Item
      ? (unmarshall(membershipResp.Item) as UserTenantMembership)
      : undefined;
    if (!membership) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const tenantResp = await client.send(
      new GetItemCommand({
        TableName: tenantsTable,
        Key: { tenantId: { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    const tenant = tenantResp.Item ? (unmarshall(tenantResp.Item) as Tenant) : undefined;
    if (!canManageParticipants(membership, tenant?.settings)) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const profiles: ParticipantProfile[] = (result.Items || []).map((item) =>
      unmarshall(item) as ParticipantProfile,
    );

    const filtered = search
      ? profiles.filter((p) => {
          const userId = (p.userId || "").toLowerCase();
          const email = (p.email || "").toLowerCase();
          return userId.includes(search) || email.includes(search);
        })
      : profiles;

    const participants: ParticipantListItem[] = filtered
      .map((profile) => ({
        ...profile,
        status: deriveParticipantStatus(profile),
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));

    return {
      statusCode: 200,
      body: JSON.stringify(participants),
    };
  } catch (error) {
    console.error("Failed to list participants:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to list participants" }),
    };
  }
};

