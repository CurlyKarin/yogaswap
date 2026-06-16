import {
  DynamoDBClient,
  TransactWriteItemsCommand,
  type TransactWriteItem,
} from "@aws-sdk/client-dynamodb";
import type { RingCyclePlan } from "./ringSwapExecution";
import { buildSwapDynamoKeys } from "./ringSwapExecution";

type ExecuteRingCyclePlanInput = {
  client: DynamoDBClient;
  tenantId: string;
  plan: RingCyclePlan;
  swapsTable: string;
  overridesTable: string;
};

export async function executeRingCyclePlan(input: ExecuteRingCyclePlanInput): Promise<void> {
  const { client, tenantId, plan, swapsTable, overridesTable } = input;
  const transactItems: TransactWriteItem[] = [];

  for (const swap of plan.swapActivations) {
    const { user_swapId } = buildSwapDynamoKeys(swap);
    transactItems.push({
      Update: {
        TableName: swapsTable,
        Key: {
          tenantId: { S: tenantId },
          user_swapId: { S: user_swapId },
        },
        UpdateExpression:
          "SET #status = :active, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":active": { S: "active" },
          ":pending": { S: "pending" },
          ":fromStatus": { S: `${swap.fromDate}_${swap.fromCourseId}_active` },
          ":toStatus": { S: `${swap.toDate}_${swap.toCourseId}_active` },
        },
      },
    });
  }

  for (const write of plan.overrideWrites) {
    const courseId_date = `${write.override.courseId}_${write.override.date}`;
    if (write.mode === "create") {
      transactItems.push({
        Put: {
          TableName: overridesTable,
          Item: {
            tenantId: { S: tenantId },
            courseId_date: { S: courseId_date },
            courseId: { S: write.override.courseId.toString() },
            date: { S: write.override.date },
            participants: { L: write.override.participants.map((p) => ({ S: p })) },
            swapped: { L: (write.override.swapped ?? []).map((s) => ({ S: s })) },
            waitlist: { L: (write.override.waitlist ?? []).map((w) => ({ S: w })) },
            shortNoticeCancellations: {
              L: (write.override.shortNoticeCancellations ?? []).map((w) => ({ S: w })),
            },
          },
          ConditionExpression: "attribute_not_exists(courseId_date)",
        },
      });
    } else {
      transactItems.push({
        Update: {
          TableName: overridesTable,
          Key: {
            tenantId: { S: tenantId },
            courseId_date: { S: courseId_date },
          },
          UpdateExpression: "SET #participants = :participants, #swapped = :swapped, #waitlist = :waitlist",
          ExpressionAttributeNames: {
            "#participants": "participants",
            "#swapped": "swapped",
            "#waitlist": "waitlist",
          },
          ExpressionAttributeValues: {
            ":participants": { L: write.override.participants.map((p) => ({ S: p })) },
            ":swapped": { L: (write.override.swapped ?? []).map((s) => ({ S: s })) },
            ":waitlist": { L: (write.override.waitlist ?? []).map((w) => ({ S: w })) },
          },
        },
      });
    }
  }

  for (const swap of plan.swapDeletions) {
    const { user_swapId } = buildSwapDynamoKeys(swap);
    transactItems.push({
      Delete: {
        TableName: swapsTable,
        Key: {
          tenantId: { S: tenantId },
          user_swapId: { S: user_swapId },
        },
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":pending": { S: "pending" },
        },
      },
    });
  }

  if (transactItems.length === 0) return;

  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: transactItems,
    }),
  );
}

export function isTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "TransactionCanceledException"
  );
}
