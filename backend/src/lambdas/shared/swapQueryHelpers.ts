import { GetItemCommand, QueryCommand, type AttributeValue, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Swap } from "@yogaswap/shared";
import { dynamoItemToSwap } from "./swapDynamo";
import { resolveParticipantQueryRefs } from "./participantResolver";

function mergeSwapsByKey(swaps: Swap[]): Swap[] {
  const byKey = new Map<string, Swap>();
  for (const swap of swaps) {
    const key = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}_${swap.participantId}`;
    byKey.set(key, swap);
  }
  return [...byKey.values()];
}

export async function querySwapsForUserRefs(input: {
  client: DynamoDBClient;
  swapsTable: string;
  tenantId: string;
  userRefs: string[];
  fromDate?: string;
  fromCourseId?: string;
  toDate?: string;
  toCourseId?: string;
}): Promise<Swap[]> {
  const { client, swapsTable, tenantId, userRefs, fromDate, fromCourseId, toDate, toCourseId } = input;
  const collected: Swap[] = [];

  for (const user of userRefs) {
    const tenantId_user = `${tenantId}#${user}`;
    let command: QueryCommand;
    if (fromDate && fromCourseId) {
      command = new QueryCommand({
        TableName: swapsTable,
        IndexName: "GSI_From",
        KeyConditionExpression: "tenantId_user = :tu AND begins_with(fromDate_fromCourseId_status, :f)",
        ExpressionAttributeValues: {
          ":tu": { S: tenantId_user },
          ":f": { S: `${fromDate}_${fromCourseId}` },
        },
        ConsistentRead: true,
      });
    } else if (toDate && toCourseId) {
      command = new QueryCommand({
        TableName: swapsTable,
        IndexName: "GSI_To",
        KeyConditionExpression: "tenantId_user = :tu AND begins_with(toDate_toCourseId_status, :t)",
        ExpressionAttributeValues: {
          ":tu": { S: tenantId_user },
          ":t": { S: `${toDate}_${toCourseId}` },
        },
        ConsistentRead: true,
      });
    } else {
      command = new QueryCommand({
        TableName: swapsTable,
        KeyConditionExpression: "tenantId = :tid AND begins_with(user_swapId, :uprefix)",
        ExpressionAttributeValues: {
          ":tid": { S: tenantId },
          ":uprefix": { S: `${user}#` },
        },
        ConsistentRead: true,
      });
    }

    const data = await client.send(command);
    for (const item of data.Items ?? []) {
      const swap = dynamoItemToSwap(item);
      if (swap) collected.push(swap);
    }
  }

  return mergeSwapsByKey(collected);
}

export async function findSwapByUserRef(input: {
  client: DynamoDBClient;
  swapsTable: string;
  tenantId: string;
  swapId: string;
  userRef: string;
  participantsTable?: string;
}): Promise<{ user_swapId: string; item: Record<string, AttributeValue> } | undefined> {
  const { client, swapsTable, tenantId, swapId, userRef, participantsTable } = input;
  const refs = await resolveParticipantQueryRefs(client, participantsTable, tenantId, userRef);
  for (const user of refs) {
    const user_swapId = `${user}#${swapId}`;
    const resp = await client.send(
      new GetItemCommand({
        TableName: swapsTable,
        Key: { tenantId: { S: tenantId }, user_swapId: { S: user_swapId } },
        ConsistentRead: true,
      }),
    );
    if (resp.Item) return { user_swapId, item: resp.Item };
  }
  return undefined;
}

export async function resolveSwapUserKey(input: {
  client: DynamoDBClient;
  swapsTable: string;
  tenantId: string;
  swapId: string;
  userRef: string;
  participantsTable?: string;
}): Promise<string | undefined> {
  const found = await findSwapByUserRef(input);
  return found?.user_swapId;
}
