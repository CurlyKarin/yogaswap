import { AttributeValue, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  assessHorizonShrinkBlockers,
  formatHorizonShrinkBlockedMessage,
  type HorizonShrinkBlockerCounts,
  type HorizonShrinkOverrideRef,
  type HorizonShrinkSwapRef,
} from "@yogaswap/shared";

function listLength(item: Record<string, AttributeValue> | undefined, key: string): number {
  const list = item?.[key]?.L;
  return list?.length ?? 0;
}

function mapSwapItem(item: Record<string, AttributeValue>): HorizonShrinkSwapRef {
  return {
    fromCourseId: String(item.fromCourseId?.S ?? item.fromCourseId?.N ?? ""),
    toCourseId: String(item.toCourseId?.S ?? item.toCourseId?.N ?? ""),
    fromDate: item.fromDate?.S ?? "",
    toDate: item.toDate?.S ?? "",
    status: item.status?.S ?? "",
  };
}

function mapOverrideItem(item: Record<string, AttributeValue>): HorizonShrinkOverrideRef | null {
  const courseId = item.courseId?.S;
  const date = item.date?.S;
  if (!courseId || !date) return null;
  return {
    courseId,
    date,
    participantsCount: listLength(item, "participants"),
    swappedCount: listLength(item, "swapped"),
    waitlistCount: listLength(item, "waitlist"),
  };
}

async function loadRollingCourseIds(
  client: DynamoDBClient,
  coursesTable: string,
  tenantId: string,
): Promise<Set<string>> {
  const rolling = new Set<string>();
  const resp = await client.send(
    new QueryCommand({
      TableName: coursesTable,
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: { ":tid": { S: tenantId } },
      ProjectionExpression: "courseId, planningMode",
      ConsistentRead: true,
    }),
  );
  for (const item of resp.Items ?? []) {
    if (item.planningMode?.S !== "rolling_continuous") continue;
    const courseId = item.courseId?.S;
    if (courseId) rolling.add(courseId);
  }
  return rolling;
}

async function loadOpenSwapsForTenant(
  client: DynamoDBClient,
  swapsTable: string,
  tenantId: string,
): Promise<HorizonShrinkSwapRef[]> {
  const resp = await client.send(
    new QueryCommand({
      TableName: swapsTable,
      KeyConditionExpression: "tenantId = :tid",
      FilterExpression: "#status IN (:pending, :active)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":tid": { S: tenantId },
        ":pending": { S: "pending" },
        ":active": { S: "active" },
      },
      ProjectionExpression:
        "fromCourseId, toCourseId, fromDate, toDate, #status",
      ConsistentRead: true,
    }),
  );
  return (resp.Items ?? []).map((item) => mapSwapItem(item));
}

async function loadOverridesForTenant(
  client: DynamoDBClient,
  overridesTable: string,
  tenantId: string,
): Promise<HorizonShrinkOverrideRef[]> {
  const resp = await client.send(
    new QueryCommand({
      TableName: overridesTable,
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: { ":tid": { S: tenantId } },
      ProjectionExpression: "courseId, #date, participants, swapped, waitlist",
      ExpressionAttributeNames: { "#date": "date" },
      ConsistentRead: true,
    }),
  );
  const result: HorizonShrinkOverrideRef[] = [];
  for (const item of resp.Items ?? []) {
    const mapped = mapOverrideItem(item);
    if (mapped) result.push(mapped);
  }
  return result;
}

export async function findHorizonShrinkBlockers(
  client: DynamoDBClient,
  params: {
    tenantId: string;
    coursesTable: string;
    swapsTable: string;
    overridesTable: string;
    currentWeeks: number;
    nextWeeks: number;
    now?: Date;
  },
): Promise<HorizonShrinkBlockerCounts | null> {
  const rollingCourseIds = await loadRollingCourseIds(
    client,
    params.coursesTable,
    params.tenantId,
  );
  if (rollingCourseIds.size === 0) return null;

  const [swaps, overrides] = await Promise.all([
    loadOpenSwapsForTenant(client, params.swapsTable, params.tenantId),
    loadOverridesForTenant(client, params.overridesTable, params.tenantId),
  ]);
  return assessHorizonShrinkBlockers({
    currentWeeks: params.currentWeeks,
    nextWeeks: params.nextWeeks,
    rollingCourseIds,
    swaps,
    overrides,
    now: params.now,
  });
}

export function horizonShrinkBlockedErrorMessage(
  blockers: HorizonShrinkBlockerCounts,
): string {
  return formatHorizonShrinkBlockedMessage(blockers);
}
