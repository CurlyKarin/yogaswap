import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  AdminResetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";

const cognito = new CognitoIdentityProviderClient({});

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
      return { statusCode: 404, body: JSON.stringify({ error: "Token not found" }) };
    }

    const expiresAt = Number(item.expiresAt?.N ?? "0");
    if (!expiresAt || expiresAt <= nowSeconds) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token expired" }) };
    }

    if (item.usedAt?.N) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token already used" }) };
    }

    const cognitoUsername = item.cognitoUsername?.S;
    if (!cognitoUsername) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token is missing cognitoUsername" }) };
    }

    // Consume token atomically so it can't be reused.
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
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Token already used or expired" }),
        };
      }
      throw e;
    }

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
    console.error("Failed to start password reset from token", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to start password reset" }),
    };
  }
};

