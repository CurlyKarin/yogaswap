import { ScanCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";

/**
 * True when another tenant still has a participant profile for the same Cognito identity (#271).
 * Matches authUserId (sub) and/or cognitoUsername — not studio login nickname (collision risk).
 */
export async function hasOtherStudioParticipantPresence(params: {
  client: DynamoDBClient;
  participantsTable: string;
  tenantId: string;
  authUserId?: string | null;
  cognitoUsername?: string | null;
}): Promise<boolean> {
  const authUserId = params.authUserId?.trim() || "";
  const cognitoUsername = params.cognitoUsername?.trim() || "";
  if (!authUserId && !cognitoUsername) return false;

  const values: Record<string, { S: string }> = {
    ":tid": { S: params.tenantId },
  };
  const parts: string[] = [];
  if (authUserId) {
    values[":sub"] = { S: authUserId };
    parts.push("authUserId = :sub");
  }
  if (cognitoUsername) {
    values[":cu"] = { S: cognitoUsername };
    parts.push("cognitoUsername = :cu");
  }
  const filter = `tenantId <> :tid AND (${parts.join(" OR ")})`;

  try {
    let startKey: Record<string, unknown> | undefined;
    do {
      const resp = await params.client.send(
        new ScanCommand({
          TableName: params.participantsTable,
          FilterExpression: filter,
          ExpressionAttributeValues: values,
          ProjectionExpression: "tenantId, userId",
          ExclusiveStartKey: startKey as never,
        }),
      );
      if ((resp.Items?.length ?? 0) > 0) return true;
      startKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey);
    return false;
  } catch (err) {
    console.warn("hasOtherStudioParticipantPresence failed:", err);
    // Fail closed for Cognito: assume other presence so we only delete local profile.
    return true;
  }
}
