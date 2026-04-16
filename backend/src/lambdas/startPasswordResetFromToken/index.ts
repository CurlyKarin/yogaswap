import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  AdminResetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";

const cognito = new CognitoIdentityProviderClient({});
const ALLOWED_PURPOSES = new Set(["invite-activation", "admin-password-reset", "user-password-reset"]);
const AUDIT_EVENT = "auth_token_password_reset";

// Note: We deliberately re-use the lightweight shared dynamoClient pattern in other lambdas,
// but for isolation (and easier test mocking) we instantiate here.
const dynamo = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tokensTable = process.env.AUTH_TOKENS_TABLE;
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

    // Consume-before-trigger strategy:
    // We intentionally mark usedAt BEFORE calling Cognito to prevent replay/race re-use.
    // If Cognito fails afterwards, admin can issue a new token via re-invite/reset action.
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
    } catch (e: unknown) {
      const name = (e as any)?.name as string | undefined;
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
      }),
    };
  } catch (err: unknown) {
    const name = (err as any)?.name as string | undefined;
    console.warn("AUDIT", {
      event: AUDIT_EVENT,
      stage: "cognito_error",
      tenantId,
      reason: name || "unknown_error",
    });
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

