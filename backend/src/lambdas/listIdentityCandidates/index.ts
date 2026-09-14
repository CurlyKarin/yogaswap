import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import {
  listCognitoUsersByEmail,
  sortIdentityCandidatesByNicknamePreference,
  type CognitoIdentityCandidate,
} from "../shared/cognitoUserIdentity";
import { getTenantContext } from "../shared/tenantContext";

const cognito = new CognitoIdentityProviderClient({});
const dynamodb = dynamoClient;

type EnrichedCandidate = CognitoIdentityCandidate & {
  /** Existing studio login name in this tenant, if already linked (#342). */
  tenantUserId?: string;
};

async function tenantUserIdsByCognitoUsername(
  tenantId: string,
  participantsTable: string,
  cognitoUsernames: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(cognitoUsernames.map((u) => u.trim()).filter(Boolean));
  const out = new Map<string, string>();
  if (wanted.size === 0) return out;
  try {
    const resp = await dynamodb.send(
      new QueryCommand({
        TableName: participantsTable,
        KeyConditionExpression: "tenantId = :tenantId",
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
        },
      }),
    );
    for (const item of resp.Items ?? []) {
      const cognitoUsername = item.cognitoUsername?.S?.trim();
      const userId = item.userId?.S?.trim();
      if (cognitoUsername && userId && wanted.has(cognitoUsername) && !out.has(cognitoUsername)) {
        out.set(cognitoUsername, userId);
      }
    }
  } catch (err) {
    console.warn("tenantUserIdsByCognitoUsername failed:", err);
  }
  return out;
}

/**
 * Admin/Instructor: Cognito pool users matching an email for explicit link vs new (#342).
 * Optional nickname prefers candidates with matching Cognito nickname attribute.
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const userPoolId = process.env.USER_POOL_ID;

  if (!membershipsTable || !tenantsTable || !userPoolId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing required environment variables" }),
    };
  }

  const { tenantId, userId } = getTenantContext(event);
  if (!userId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const canManage = await canActorManageParticipants({
    client: dynamodb,
    membershipsTable,
    tenantsTable,
    tenantId,
    actorUserId: userId,
  });
  if (!canManage) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const email = (event.queryStringParameters?.email || "").trim();
  const nickname = (event.queryStringParameters?.nickname || "").trim();
  if (!email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing email" }),
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid email" }),
    };
  }

  const raw = await listCognitoUsersByEmail(cognito, userPoolId, email);
  const sorted = sortIdentityCandidatesByNicknamePreference(raw, nickname);

  let tenantByCognito = new Map<string, string>();
  if (participantsTable) {
    tenantByCognito = await tenantUserIdsByCognitoUsername(
      tenantId,
      participantsTable,
      sorted.map((c) => c.cognitoUsername),
    );
  }

  const candidates: EnrichedCandidate[] = sorted.map((c) => ({
    ...c,
    ...(tenantByCognito.get(c.cognitoUsername)
      ? { tenantUserId: tenantByCognito.get(c.cognitoUsername) }
      : {}),
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ candidates }),
  };
};
