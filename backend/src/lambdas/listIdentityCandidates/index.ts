import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import {
  listCognitoUsersByEmail,
  sortIdentityCandidatesByNicknamePreference,
} from "../shared/cognitoUserIdentity";
import { getTenantContext } from "../shared/tenantContext";

const cognito = new CognitoIdentityProviderClient({});
const dynamodb = dynamoClient;

/**
 * Admin/Instructor: Cognito pool users matching an email for explicit link vs new (#342).
 * Optional nickname prefers candidates with matching Cognito nickname attribute.
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
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
  const candidates = sortIdentityCandidatesByNicknamePreference(raw, nickname);

  return {
    statusCode: 200,
    body: JSON.stringify({ candidates }),
  };
};
