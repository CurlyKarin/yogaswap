import {
  QueryCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

/**
 * Mark unused invite/reset tokens for a studio user as used.
 * Auth-tokens table has no userId GSI — tenant query + filter (ok for pilot volume).
 */
export async function invalidateAuthTokensForUser(params: {
  client: DynamoDBClient;
  authTokensTable: string;
  tenantId: string;
  userId: string;
  nowSeconds?: number;
}): Promise<number> {
  const { client, authTokensTable, tenantId, userId } = params;
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const target = userId.trim();
  if (!target) return 0;

  const resp = await client.send(
    new QueryCommand({
      TableName: authTokensTable,
      KeyConditionExpression: "tenantId = :tid",
      FilterExpression: "userId = :uid AND attribute_not_exists(usedAt)",
      ExpressionAttributeValues: {
        ":tid": { S: tenantId },
        ":uid": { S: target },
      },
      ConsistentRead: true,
    }),
  );

  let invalidated = 0;
  for (const item of resp.Items ?? []) {
    const token = item.token?.S?.trim();
    if (!token) continue;
    try {
      await client.send(
        new UpdateItemCommand({
          TableName: authTokensTable,
          Key: {
            tenantId: { S: tenantId },
            token: { S: token },
          },
          UpdateExpression: "SET usedAt = :now",
          ConditionExpression: "attribute_not_exists(usedAt)",
          ExpressionAttributeValues: {
            ":now": { N: String(nowSeconds) },
          },
        }),
      );
      invalidated += 1;
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "ConditionalCheckFailedException") continue;
      throw err;
    }
  }
  return invalidated;
}
