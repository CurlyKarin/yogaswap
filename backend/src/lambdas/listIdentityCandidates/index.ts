import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { getParticipantStatus, type ParticipantStatus } from "@yogaswap/shared";
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

type TenantLinkMeta = {
  tenantUserId: string;
  tenantStatus: ParticipantStatus;
  /** Current studio member (any status) — must not be linked as another person (#342). */
  linkBlocked: boolean;
};

type EnrichedCandidate = CognitoIdentityCandidate & Partial<TenantLinkMeta>;

async function tenantLinkMetaByCognitoUsername(
  tenantId: string,
  participantsTable: string,
  membershipsTable: string | undefined,
  cognitoUsernames: string[],
): Promise<Map<string, TenantLinkMeta>> {
  const wanted = new Set(cognitoUsernames.map((u) => u.trim()).filter(Boolean));
  const out = new Map<string, TenantLinkMeta>();
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
      if (!cognitoUsername || !userId || !wanted.has(cognitoUsername) || out.has(cognitoUsername)) {
        continue;
      }
      const tenantStatus = getParticipantStatus({
        authUserId: item.authUserId?.S,
        inviteSentAt: item.inviteSentAt?.S,
        inviteCompletedAt: item.inviteCompletedAt?.S,
      });
      let hasMembership = false;
      if (membershipsTable) {
        try {
          const membership = await dynamodb.send(
            new GetItemCommand({
              TableName: membershipsTable,
              Key: {
                tenantId: { S: tenantId },
                userId: { S: userId },
              },
            }),
          );
          hasMembership = !!membership.Item?.role?.S;
        } catch (memErr) {
          console.warn("tenant membership lookup failed:", memErr);
        }
      }
      out.set(cognitoUsername, {
        tenantUserId: userId,
        tenantStatus,
        // Invited or registered: still in studio — not a reactivation candidate.
        linkBlocked: hasMembership,
      });
    }
  } catch (err) {
    console.warn("tenantLinkMetaByCognitoUsername failed:", err);
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

  let tenantMeta = new Map<string, TenantLinkMeta>();
  if (participantsTable) {
    tenantMeta = await tenantLinkMetaByCognitoUsername(
      tenantId,
      participantsTable,
      membershipsTable,
      sorted.map((c) => c.cognitoUsername),
    );
  }

  const candidates: EnrichedCandidate[] = sorted.map((c) => ({
    ...c,
    ...(tenantMeta.get(c.cognitoUsername) ?? {}),
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ candidates }),
  };
};
