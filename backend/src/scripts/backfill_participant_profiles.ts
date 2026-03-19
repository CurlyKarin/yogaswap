import {
  ScanCommand,
  PutItemCommand,
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

  console.log(`Backfill done: scanned=${scanned}, attemptedCreates=${created}`);
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

