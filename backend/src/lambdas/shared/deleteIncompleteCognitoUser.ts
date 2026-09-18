import {
  AdminDeleteUserCommand,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { ScanCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { effectiveCognitoUsername } from "./cognitoUserIdentity";

/**
 * Best-effort Cognito delete for invite-only withdrawals (never completed registration).
 * Does not throw — deletion of Dynamo membership/profile must still succeed.
 */
export async function deleteCognitoUserBestEffort(params: {
  cognito: CognitoIdentityProviderClient;
  userPoolId: string;
  cognitoUsername?: string | null;
  userId: string;
}): Promise<boolean> {
  const username = effectiveCognitoUsername(params.cognitoUsername, params.userId).trim();
  if (!username || !params.userPoolId.trim()) return false;
  try {
    await params.cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: params.userPoolId,
        Username: username,
      }),
    );
    return true;
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === "UserNotFoundException") return false;
    console.warn("deleteCognitoUserBestEffort failed:", err);
    return false;
  }
}

/**
 * True when any tenant profile for this pool user finished invite/registration.
 * Pilot-scale Scan (no authUserId GSI) — only used on explicit link without local profile.
 */
export async function hasCompletedInviteForPoolUser(params: {
  client: DynamoDBClient;
  participantsTable: string;
  cognitoUsername: string;
  authUserId?: string;
}): Promise<boolean> {
  const cognitoUsername = params.cognitoUsername.trim();
  const authUserId = params.authUserId?.trim();
  if (!cognitoUsername && !authUserId) return false;

  const values: Record<string, { S: string }> = {
    ":cu": { S: cognitoUsername || "__none__" },
  };
  let filter =
    "cognitoUsername = :cu AND attribute_exists(inviteCompletedAt)";
  if (authUserId) {
    values[":sub"] = { S: authUserId };
    filter =
      "(cognitoUsername = :cu OR authUserId = :sub) AND attribute_exists(inviteCompletedAt)";
  }

  try {
    let startKey: Record<string, unknown> | undefined;
    do {
      const resp = await params.client.send(
        new ScanCommand({
          TableName: params.participantsTable,
          FilterExpression: filter,
          ExpressionAttributeValues: values,
          ProjectionExpression: "tenantId, userId",
          ExclusiveStartKey: startKey as any,
        }),
      );
      if ((resp.Items?.length ?? 0) > 0) return true;
      startKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey);
    return false;
  } catch (err) {
    console.warn("hasCompletedInviteForPoolUser failed:", err);
    return false;
  }
}
