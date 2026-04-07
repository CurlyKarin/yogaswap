import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import crypto from "crypto";

const ses = new SESClient({});
const dynamodb = dynamoClient;
function generateOneTimeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const authTokensTable = process.env.AUTH_TOKENS_TABLE;
  const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
  const baseUrlEnv = process.env.BASE_URL || "";
  const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;

  if (!participantsTable || !membershipsTable || !authTokensTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing required environment variables" }),
    };
  }

  const targetUserId = event.pathParameters?.userId?.trim();
  if (!targetUserId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
    const actorMembershipResp = await dynamodb.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: actorUserId },
        },
        ConsistentRead: true,
      }),
    );
    const actorRole = actorMembershipResp.Item?.role?.S;
    if (actorRole !== "admin") {
      return { statusCode: 403, body: JSON.stringify({ error: "Only admins can reset passwords" }) };
    }

    const participantResp = await dynamodb.send(
      new GetItemCommand({
        TableName: participantsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: targetUserId },
        },
        ConsistentRead: true,
      }),
    );
    const participant = participantResp.Item;
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: "Participant not found" }) };
    }

    const email = participant.email?.S?.trim();
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Participant has no email" }) };
    }

    const cognitoUsername = participant.cognitoUsername?.S || participant.userId?.S || targetUserId;

    // One-Time Token: Token-Link startet dann den Cognito-Code-Flow (ohne temporäres Passwort per E-Mail).
    const tokenTtlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || "3600");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const oneTimeToken = generateOneTimeToken();

    await dynamodb.send(
      new PutItemCommand({
        TableName: authTokensTable,
        Item: {
          tenantId: { S: tenantId },
          token: { S: oneTimeToken },
          cognitoUsername: { S: cognitoUsername },
          userId: { S: targetUserId },
          purpose: { S: "admin-password-reset" },
          createdAt: { N: String(nowSeconds) },
          expiresAt: { N: String(nowSeconds + tokenTtlSeconds) },
        },
      }),
    );

    const link = `${baseUrl}/invite?mode=admin_reset&tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(oneTimeToken)}&nickname=${encodeURIComponent(
      cognitoUsername,
    )}&email=${encodeURIComponent(email)}`;

    let emailSent = false;
    try {
      await ses.send(
        new SendEmailCommand({
          Source: sesSourceEmail,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: "YogaSwap Passwort zuruecksetzen" },
            Body: {
              Html: {
                Data: `
                <h2>Hallo ${targetUserId}!</h2>
                <p>Dein Passwort fuer YogaSwap wurde zurueckgesetzt.</p>
                <p><a href="${link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
                <p>Danach erhältst du eine E-Mail mit einem Code zur Bestätigung.</p>
              `,
              },
            },
          },
        }),
      );
      emailSent = true;
    } catch (mailErr) {
      console.warn("Failed to send reset email:", mailErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        userId: targetUserId,
        email,
        emailSent,
      }),
    };
  } catch (error) {
    console.error("Failed to reset participant password:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to reset participant password" }),
    };
  }
};

