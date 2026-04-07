import {
  ScanCommand,
  PutItemCommand,
  UpdateItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../lambdas/shared/dynamoClient";

const client = dynamoClient;

const MEMBERSHIPS_TABLE =
  process.env.MEMBERSHIPS_TABLE || "yogaswap-demo-memberships-table";
const PARTICIPANTS_TABLE =
  process.env.PARTICIPANTS_TABLE || "yogaswap-demo-participants-table";

async function run(): Promise<void> {
  console.log(
    `Backfill start: memberships=${MEMBERSHIPS_TABLE}, participants=${PARTICIPANTS_TABLE}`,
  );

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  let scanned = 0;
  let created = 0;
  let normalizedUpdated = 0;
  let inviteCompletedUpdated = 0;

  do {
    const scanResp = await client.send(
      new ScanCommand({
        TableName: MEMBERSHIPS_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    const items = scanResp.Items || [];
    scanned += items.length;

    for (const item of items) {
      const tenantId = item.tenantId?.S;
      const userId = item.userId?.S;
      if (!tenantId || !userId) continue;

      let inserted = false;
      try {
        await client.send(
          new PutItemCommand({
            TableName: PARTICIPANTS_TABLE,
            Item: {
              tenantId: { S: tenantId },
              userId: { S: userId },
              userIdNormalized: { S: userId.toLowerCase() },
            },
            // Create only if missing; keeps existing profile fields untouched.
            ConditionExpression:
              "attribute_not_exists(tenantId) AND attribute_not_exists(userId)",
          }),
        );
        inserted = true;
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name?: string }).name === "ConditionalCheckFailedException"
        ) {
          inserted = false;
        } else {
          throw error;
        }
      }

      if (inserted) created += 1;
    }

    lastEvaluatedKey = scanResp.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Existing participant profiles: ensure userIdNormalized is populated.
  let participantLastEvaluatedKey: Record<string, AttributeValue> | undefined;
  do {
    const participantScanResp = await client.send(
      new ScanCommand({
        TableName: PARTICIPANTS_TABLE,
        ExclusiveStartKey: participantLastEvaluatedKey,
      }),
    );
    const items = participantScanResp.Items || [];
    for (const item of items) {
      const tenantId = item.tenantId?.S;
      const userId = item.userId?.S;
      if (!tenantId || !userId) continue;
      const normalized = userId.toLowerCase();
      const currentNormalized = item.userIdNormalized?.S;
      const authUserId = item.authUserId?.S?.trim();
      const inviteCompletedAt = item.inviteCompletedAt?.S?.trim();
      const inviteSentAt = item.inviteSentAt?.S?.trim();

      const needsNormalized = currentNormalized !== normalized;
      const needsInviteCompleted = !!authUserId && !inviteCompletedAt;

      if (!needsNormalized && !needsInviteCompleted) continue;

      const expressionParts: string[] = [];
      const values: Record<string, AttributeValue> = {};
      if (needsNormalized) {
        expressionParts.push("userIdNormalized = :normalized");
        values[":normalized"] = { S: normalized };
      }
      if (needsInviteCompleted) {
        expressionParts.push("inviteCompletedAt = :inviteCompletedAt");
        values[":inviteCompletedAt"] = { S: inviteSentAt || new Date().toISOString() };
      }

      await client.send(
        new UpdateItemCommand({
          TableName: PARTICIPANTS_TABLE,
          Key: {
            tenantId: { S: tenantId },
            userId: { S: userId },
          },
          UpdateExpression: `SET ${expressionParts.join(", ")}`,
          ExpressionAttributeValues: values,
        }),
      );

      if (needsNormalized) normalizedUpdated += 1;
      if (needsInviteCompleted) inviteCompletedUpdated += 1;
    }
    participantLastEvaluatedKey = participantScanResp.LastEvaluatedKey;
  } while (participantLastEvaluatedKey);

  console.log(
    `Backfill done: scanned=${scanned}, attemptedCreates=${created}, normalizedUpdated=${normalizedUpdated}, inviteCompletedUpdated=${inviteCompletedUpdated}`,
  );
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

