import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import crypto from "crypto";
import { dynamoClient } from "../shared/dynamoClient";

const cognito = new CognitoIdentityProviderClient({});
const ALLOWED_PURPOSES = new Set(["invite-activation", "admin-password-reset", "user-password-reset"]);
const AUDIT_EVENT = "auth_token_password_reset";

// Note: We deliberately re-use the lightweight shared dynamoClient pattern in other lambdas,
// but for isolation (and easier test mocking) we instantiate here.
const dynamo = dynamoClient;

/** Cognito AdminResetUserPassword requires CONFIRMED; new invites stay FORCE_CHANGE_PASSWORD (#401). */
function generateBridgePassword(): string {
  // Mix of classes to satisfy typical Cognito password policies.
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}

async function releaseTokenUsedAt(params: {
  tokensTable: string;
  tenantId: string;
  token: string;
}): Promise<void> {
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: params.tokensTable,
        Key: {
          tenantId: { S: params.tenantId },
          token: { S: params.token },
        },
        UpdateExpression: "REMOVE usedAt",
        ConditionExpression: "attribute_exists(usedAt)",
      }),
    );
  } catch (releaseErr: unknown) {
    const name = (releaseErr as { name?: string })?.name;
    if (name === "ConditionalCheckFailedException") return;
    console.warn("AUDIT", {
      event: AUDIT_EVENT,
      stage: "release_usedAt_failed",
      tenantId: params.tenantId,
      reason: name || "unknown_error",
    });
  }
}

/**
 * AdminResetUserPassword fails for FORCE_CHANGE_PASSWORD ("cannot be reset in the current state").
 * Bridge to CONFIRMED with a throwaway permanent password so the code-email flow can run (#401).
 */
async function ensureResettableCognitoState(params: {
  userPoolId: string;
  cognitoUsername: string;
  tenantId: string;
  purpose: string;
}): Promise<void> {
  const user = await cognito.send(
    new AdminGetUserCommand({
      UserPoolId: params.userPoolId,
      Username: params.cognitoUsername,
    }),
  );
  const status = user.UserStatus?.trim();
  if (status !== "FORCE_CHANGE_PASSWORD") return;

  console.info("AUDIT", {
    event: AUDIT_EVENT,
    stage: "bridge_force_change_password",
    tenantId: params.tenantId,
    purpose: params.purpose,
    cognitoUsername: params.cognitoUsername,
  });

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: params.userPoolId,
      Username: params.cognitoUsername,
      Password: generateBridgePassword(),
      Permanent: true,
    }),
  );
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tokensTable = process.env.AUTH_TOKENS_TABLE;
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const userPoolId = process.env.USER_POOL_ID;

  if (!tokensTable || !userPoolId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing required environment variables" }),
    };
  }

  const query = event.queryStringParameters ?? {};
  const token = query.token ?? query.Token;
  const tenantId = query.tenantId ?? query.TENANTID;

  if (!token || !tenantId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing token or tenantId" }),
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  let tokenConsumed = false;
  let purposeForAudit: string | null = null;

  try {
    console.info("AUDIT", {
      event: AUDIT_EVENT,
      stage: "trigger",
      tenantId,
      tokenProvided: true,
    });

    const getResp = await dynamo.send(
      new GetItemCommand({
        TableName: tokensTable,
        Key: {
          tenantId: { S: tenantId },
          token: { S: token },
        },
        ConsistentRead: true,
      }),
    );

    const item = getResp.Item;
    if (!item) {
      console.warn("AUDIT", {
        event: AUDIT_EVENT,
        stage: "reject",
        tenantId,
        reason: "token_not_found",
      });
      return { statusCode: 404, body: JSON.stringify({ error: "Token not found" }) };
    }

    const purpose = item.purpose?.S?.trim();
    purposeForAudit = purpose ?? null;
    if (!purpose || !ALLOWED_PURPOSES.has(purpose)) {
      console.warn("AUDIT", {
        event: AUDIT_EVENT,
        stage: "reject",
        tenantId,
        reason: "invalid_purpose",
        purpose: purpose ?? null,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Token purpose is invalid" }),
      };
    }

    const expiresAt = Number(item.expiresAt?.N ?? "0");
    if (!expiresAt || expiresAt <= nowSeconds) {
      console.warn("AUDIT", {
        event: AUDIT_EVENT,
        stage: "reject",
        tenantId,
        reason: "token_expired",
        purpose,
      });
      return { statusCode: 400, body: JSON.stringify({ error: "Token expired" }) };
    }

    if (item.usedAt?.N) {
      console.warn("AUDIT", {
        event: AUDIT_EVENT,
        stage: "reject",
        tenantId,
        reason: "token_already_used",
        purpose,
      });
      return { statusCode: 400, body: JSON.stringify({ error: "Token already used" }) };
    }

    const cognitoUsername = item.cognitoUsername?.S;
    if (!cognitoUsername) {
      console.warn("AUDIT", {
        event: AUDIT_EVENT,
        stage: "reject",
        tenantId,
        reason: "missing_cognito_username",
        purpose,
      });
      return { statusCode: 400, body: JSON.stringify({ error: "Token is missing cognitoUsername" }) };
    }
    const tokenNonce = item.tokenNonce?.S?.trim();
    const tokenUserId = item.userId?.S?.trim();
    if (tokenNonce) {
      if (!participantsTable || !tokenUserId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Token is invalid" }) };
      }
      const participantResp = await dynamo.send(
        new GetItemCommand({
          TableName: participantsTable,
          Key: {
            tenantId: { S: tenantId },
            userId: { S: tokenUserId },
          },
          ConsistentRead: true,
        }),
      );
      const latestNonce = participantResp.Item?.latestAuthTokenNonce?.S?.trim();
      if (latestNonce && latestNonce !== tokenNonce) {
        console.warn("AUDIT", {
          event: AUDIT_EVENT,
          stage: "reject",
          tenantId,
          reason: "token_superseded",
          purpose,
        });
        return { statusCode: 400, body: JSON.stringify({ error: "Token superseded by newer link" }) };
      }
    }

    // Prepare Cognito BEFORE consuming the app token so FORCE_CHANGE failures keep the link usable (#401).
    await ensureResettableCognitoState({
      userPoolId,
      cognitoUsername,
      tenantId,
      purpose,
    });

    // Consume-before-trigger: prevent replay while Cognito reset runs.
    // On Cognito failure we release usedAt so the same invite link remains retryable (#401).
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: tokensTable,
          Key: {
            tenantId: { S: tenantId },
            token: { S: token },
          },
          UpdateExpression: "SET usedAt = :now",
          ConditionExpression: "attribute_not_exists(usedAt) AND expiresAt > :now",
          ExpressionAttributeValues: {
            ":now": { N: String(nowSeconds) },
          },
        }),
      );
      tokenConsumed = true;
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name;
      if (name === "ConditionalCheckFailedException") {
        console.warn("AUDIT", {
          event: AUDIT_EVENT,
          stage: "reject",
          tenantId,
          reason: "token_used_or_expired_on_consume",
          purpose,
        });
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Token already used or expired" }),
        };
      }
      throw e;
    }

    console.info("AUDIT", {
      event: AUDIT_EVENT,
      stage: "consume",
      tenantId,
      purpose,
      cognitoUsername,
      consumedAt: nowSeconds,
    });

    await cognito.send(
      new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: cognitoUsername,
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        username: cognitoUsername,
        // Studio-Login-Name for Dynamo/self-link; Amplify uses `username` (may be opaque #324)
        ...(tokenUserId ? { userId: tokenUserId } : {}),
      }),
    };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    console.warn("AUDIT", {
      event: AUDIT_EVENT,
      stage: "cognito_error",
      tenantId,
      reason: name || "unknown_error",
      purpose: purposeForAudit,
    });

    if (tokenConsumed) {
      await releaseTokenUsedAt({ tokensTable, tenantId, token });
      console.info("AUDIT", {
        event: AUDIT_EVENT,
        stage: "release_usedAt",
        tenantId,
        purpose: purposeForAudit,
      });
    }

    if (name === "UserNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
    }
    if (name === "InvalidParameterException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Password reset code cannot be delivered. Please ask admin to update participant email and re-invite.",
        }),
      };
    }
    if (name === "NotAuthorizedException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Password reset is currently not allowed for this account state. Please ask admin to re-invite again.",
        }),
      };
    }
    if (name === "CodeDeliveryFailureException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Reset code could not be delivered. Please ask admin to verify participant email and re-invite.",
        }),
      };
    }
    if (name === "TooManyRequestsException" || name === "LimitExceededException") {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: "Too many reset attempts. Please wait a moment and try again.",
        }),
      };
    }
    console.error("Failed to start password reset from token", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to start password reset" }),
    };
  }
};
