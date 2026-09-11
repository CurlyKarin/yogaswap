import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import { effectiveCognitoUsername } from "../shared/cognitoUserIdentity";

const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";
const dynamodb = dynamoClient;

/** Enumeration-safe failure (same shape for unknown nickname / no membership). */
function getNotFound(): APIGatewayProxyResult {
  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Login failed" }),
  };
}

/**
 * Public: Studio-Login-Name (nickname) → Cognito Username for Amplify signIn (#324).
 * Tenant from hostname / x-tenant-id like other auth endpoints.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;

  if (!participantsTable || !membershipsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing required environment variables" }),
    };
  }

  let body: { nickname?: unknown } | null = null;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const nicknameRaw = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!nicknameRaw) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing nickname" }) };
  }

  const nicknameNormalized = nicknameRaw.toLowerCase();
  const { tenantId } = getTenantContext(event);

  try {
    const exactLower = await dynamodb.send(
      new GetItemCommand({
        TableName: participantsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: nicknameNormalized },
        },
        ConsistentRead: true,
      }),
    );
    let profileItem = exactLower.Item;

    if (!profileItem) {
      try {
        const queryResp = await dynamodb.send(
          new QueryCommand({
            TableName: participantsTable,
            IndexName: PARTICIPANTS_NORMALIZED_INDEX,
            KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
            ExpressionAttributeValues: {
              ":tenantId": { S: tenantId },
              ":userIdNormalized": { S: nicknameNormalized },
            },
            Limit: 1,
          }),
        );
        profileItem = queryResp.Items?.[0];
      } catch (lookupErr) {
        console.warn("Failed normalized participant lookup for resolveLogin", lookupErr);
      }
    }

    if (!profileItem?.userId?.S) {
      return getNotFound();
    }

    const canonicalUserId = profileItem.userId.S;
    const cognitoUsername = effectiveCognitoUsername(
      profileItem.cognitoUsername?.S,
      canonicalUserId,
    );

    const membership = await dynamodb.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: canonicalUserId },
        },
        ConsistentRead: true,
      }),
    );
    if (!membership.Item) {
      return getNotFound();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        cognitoUsername,
        nickname: canonicalUserId,
      }),
    };
  } catch (error) {
    console.error("Failed to resolve login", error);
    return getNotFound();
  }
};
