import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type {
  ParticipantProfile,
  ParticipantSettings,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import { deriveParticipantStatus } from "../shared/participantStatus";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

type UpdateParticipantBody = {
  email?: string | null;
  settings?: ParticipantSettings;
  inviteSentAt?: string | null;
  authUserId?: string | null;
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

  const userId = event.pathParameters?.userId?.trim();
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing userId in path" }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let body: UpdateParticipantBody;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
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
        TableName: tableName,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
        ConsistentRead: true,
      }),
    );

    if (!existingResp.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Participant not found" }),
      };
    }

    const existing = unmarshall(existingResp.Item) as ParticipantProfile;
    const updated: ParticipantProfile = {
      ...existing,
      tenantId,
      userId,
    };

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const email = typeof body.email === "string" ? body.email.trim() : body.email;
      if (email) updated.email = email;
      else delete updated.email;
    }

    if (Object.prototype.hasOwnProperty.call(body, "settings")) {
      if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
        updated.settings = body.settings;
      } else if (body.settings == null) {
        delete updated.settings;
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "settings must be an object" }),
        };
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "inviteSentAt")) {
      if (typeof body.inviteSentAt === "string" && body.inviteSentAt.trim()) {
        updated.inviteSentAt = body.inviteSentAt;
      } else {
        delete updated.inviteSentAt;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "authUserId")) {
      if (typeof body.authUserId === "string" && body.authUserId.trim()) {
        updated.authUserId = body.authUserId;
      } else {
        delete updated.authUserId;
      }
    }

    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(updated, { removeUndefinedValues: true }),
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...updated,
        status: deriveParticipantStatus(updated),
      }),
    };
  } catch (error) {
    console.error("Failed to update participant:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to update participant" }),
    };
  }
};

