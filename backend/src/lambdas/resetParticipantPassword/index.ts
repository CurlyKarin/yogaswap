import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AdminSetUserPasswordCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});
const dynamodb = dynamoClient;

function generateSafeTempPassword(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const userPoolId = process.env.USER_POOL_ID;
  const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
  const baseUrlEnv = process.env.BASE_URL || "";
  const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;

  if (!participantsTable || !membershipsTable || !userPoolId) {
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
    const rawPassword = `${generateSafeTempPassword(10)}A1`;

    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: cognitoUsername,
        Password: rawPassword,
        Permanent: false,
      }),
    );

    const inviteSentAt = new Date().toISOString();
    await dynamodb.send(
      new PutItemCommand({
        TableName: participantsTable,
        Item: {
          ...participant,
          tenantId: { S: tenantId },
          userId: { S: targetUserId },
          inviteSentAt: { S: inviteSentAt },
        },
      }),
    );

    const link = `${baseUrl}/invite?nickname=${encodeURIComponent(cognitoUsername)}&email=${encodeURIComponent(email)}`;
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
                <p><a href="${link}">Klicke hier, um ein neues Passwort zu setzen</a></p>
                <div style="margin-top:12px;">
                  <p style="margin:0 0 6px 0;"><strong>Temporäres Passwort (bitte kopieren & einfügen):</strong></p>
                  <div>
                    <code style="display:inline-block;background:#f0f0f0;padding:8px 10px;border-radius:4px;line-height:1.4;font-family:monospace;">${rawPassword}</code>
                  </div>
                </div>
                <p>Tipp: Falls das Passwort beim Einfügen nicht funktioniert, achte auf keine Leerzeichen vor/nach dem Passwort.</p>
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

