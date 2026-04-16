import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import crypto from "crypto";
import { buildRecoveryMail } from "../shared/templates/auth/authMailTemplates";

const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";
const ses = new SESClient({});
const dynamodb = dynamoClient;

function generateOneTimeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function getGenericSuccess(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const authTokensTable = process.env.AUTH_TOKENS_TABLE;
  const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
  const mailLocale = process.env.MAIL_LOCALE || "de";
  const baseUrlEnv = process.env.BASE_URL || "";
  const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;

  if (!participantsTable || !membershipsTable || !authTokensTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing required environment variables" }),
    };
  }

  const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  const nicknameRaw = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!nicknameRaw) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing nickname" }) };
  }

  const nicknameNormalized = nicknameRaw.toLowerCase();
  const { tenantId } = getTenantContext(event);

  try {
    let canonicalUserId = nicknameRaw;
    let cognitoUsername = "";
    let targetEmail = "";

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
        console.warn("Failed normalized participant lookup for self reset", lookupErr);
      }
    }

    if (!profileItem) {
      return getGenericSuccess();
    }

    canonicalUserId = profileItem.userId?.S || canonicalUserId;
    cognitoUsername = profileItem.cognitoUsername?.S || profileItem.userId?.S || canonicalUserId;
    targetEmail = profileItem.email?.S?.trim() || "";

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
      return getGenericSuccess();
    }

    if (!targetEmail || !cognitoUsername) {
      return getGenericSuccess();
    }

    const tokenTtlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || "3600");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const oneTimeToken = generateOneTimeToken();
    const tokenNonce = generateOneTimeToken(12);

    await dynamodb.send(
      new UpdateItemCommand({
        TableName: participantsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: canonicalUserId },
        },
        UpdateExpression: "SET latestAuthTokenNonce = :nonce",
        ExpressionAttributeValues: {
          ":nonce": { S: tokenNonce },
        },
      }),
    );

    await dynamodb.send(
      new PutItemCommand({
        TableName: authTokensTable,
        Item: {
          tenantId: { S: tenantId },
          token: { S: oneTimeToken },
          cognitoUsername: { S: cognitoUsername },
          userId: { S: canonicalUserId },
          purpose: { S: "user-password-reset" },
          tokenNonce: { S: tokenNonce },
          createdAt: { N: String(nowSeconds) },
          expiresAt: { N: String(nowSeconds + tokenTtlSeconds) },
        },
      }),
    );

    const link = `${baseUrl}/invite?mode=password_recovery&tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(oneTimeToken)}&nickname=${encodeURIComponent(
      canonicalUserId,
    )}&email=${encodeURIComponent(targetEmail)}`;
    const recoveryMail = buildRecoveryMail({
      locale: mailLocale,
      nickname: canonicalUserId,
      link,
    });

    await ses.send(
      new SendEmailCommand({
        Source: sesSourceEmail,
        Destination: { ToAddresses: [targetEmail] },
        Message: {
          Subject: { Data: recoveryMail.subject },
          Body: {
            Html: {
              Data: recoveryMail.html,
            },
          },
        },
      }),
    );

    return getGenericSuccess();
  } catch (error) {
    console.error("Failed to request self password reset", error);
    return getGenericSuccess();
  }
};

