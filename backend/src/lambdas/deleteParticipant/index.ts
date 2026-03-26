import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { ParticipantProfile } from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;

  if (!participantsTable || !membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "PARTICIPANTS_TABLE, MEMBERSHIPS_TABLE or TENANTS_TABLE env var is not set",
      }),
    };
  }

  const userId = event.pathParameters?.userId?.trim();
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing userId in path" }),
    };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
    const canManage = await canActorManageParticipants({
      client,
      membershipsTable,
      tenantsTable,
      tenantId,
      actorUserId,
    });
    if (!canManage) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const existingResp = await client.send(
      new GetItemCommand({
        TableName: participantsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
        ConsistentRead: true,
      }),
    );
    const profile = existingResp.Item
      ? (unmarshall(existingResp.Item) as ParticipantProfile)
      : undefined;

    await client.send(
      new DeleteItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
      }),
    );

    let profileDeleted = false;
    const hasAuthUserId = !!profile?.authUserId;

    if (profile && !hasAuthUserId) {
      const membershipsByUser = await client.send(
        new ScanCommand({
          TableName: membershipsTable,
          FilterExpression: "userId = :uid",
          ExpressionAttributeValues: {
            ":uid": { S: userId },
          },
          ConsistentRead: true,
        }),
      );
      const hasAnyMembership = (membershipsByUser.Count ?? 0) > 0;

      if (!hasAnyMembership) {
        await client.send(
          new DeleteItemCommand({
            TableName: participantsTable,
            Key: {
              tenantId: { S: tenantId },
              userId: { S: userId },
            },
          }),
        );
        profileDeleted = true;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        membershipDeleted: true,
        profileDeleted,
      }),
    };
  } catch (error) {
    console.error("Failed to delete participant:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to delete participant" }),
    };
  }
};

