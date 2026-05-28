import { DeleteItemCommand, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Swap, TenantSettings } from "@yogaswap/shared";
import {
  isWithinCancellationSwapCutoff,
  removeUserCaseInsensitive,
  resolveCancellationSwapCutoffMinutes,
} from "@yogaswap/shared";
import { mapOverrideItem, stringListAttribute } from "./overrideDynamo";

type CourseTimeLookup = Map<number, string>;

export async function loadCourseTimesByLegacyId(
  client: DynamoDBClient,
  coursesTable: string,
  tenantId: string,
  legacyCourseIds: number[],
): Promise<CourseTimeLookup> {
  const unique = [...new Set(legacyCourseIds)];
  const map: CourseTimeLookup = new Map();
  await Promise.all(
    unique.map(async (courseId) => {
      const resp = await client.send(
        new GetItemCommand({
          TableName: coursesTable,
          Key: { tenantId: { S: tenantId }, courseId: { S: String(courseId) } },
          ConsistentRead: true,
        }),
      );
      const time = resp.Item?.time?.S ?? "";
      map.set(courseId, time);
    }),
  );
  return map;
}

async function removeUserFromTargetWaitlist(
  client: DynamoDBClient,
  overridesTable: string,
  tenantId: string,
  swap: Swap,
): Promise<void> {
  const courseId_date = `${swap.toCourseId}_${swap.toDate}`;
  const resp = await client.send(
    new GetItemCommand({
      TableName: overridesTable,
      Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
      ConsistentRead: true,
    }),
  );
  if (!resp.Item) return;
  const override = mapOverrideItem(resp.Item);
  const waitlist = removeUserCaseInsensitive(override.waitlist ?? [], swap.user);
  if (waitlist.length === (override.waitlist ?? []).length) return;
  await client.send(
    new UpdateItemCommand({
      TableName: overridesTable,
      Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
      UpdateExpression: "SET #waitlist = :waitlist",
      ExpressionAttributeNames: { "#waitlist": "waitlist" },
      ExpressionAttributeValues: { ":waitlist": stringListAttribute(waitlist) },
    }),
  );
}

/**
 * Drops pending swaps whose origin occurrence is inside the cancellation cutoff.
 */
export async function reconcilePendingSwapsPastOriginCutoff(input: {
  client: DynamoDBClient;
  swapsTable: string;
  overridesTable: string;
  tenantId: string;
  swaps: Swap[];
  courseTimes: CourseTimeLookup;
  tenantSettings?: TenantSettings;
  now?: Date;
}): Promise<Swap[]> {
  const { client, swapsTable, overridesTable, tenantId, swaps, courseTimes, tenantSettings } = input;
  const now = input.now ?? new Date();
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  const kept: Swap[] = [];

  for (const swap of swaps) {
    if (swap.status !== "pending") {
      kept.push(swap);
      continue;
    }
    const courseTime = courseTimes.get(swap.fromCourseId) ?? "";
    const inCutoff = isWithinCancellationSwapCutoff(swap.fromDate, courseTime, cutoffMinutes, now);
    if (!inCutoff) {
      kept.push(swap);
      continue;
    }

    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    const user_swapId = `${swap.user}#${swapId}`;
    await client.send(
      new DeleteItemCommand({
        TableName: swapsTable,
        Key: { tenantId: { S: tenantId }, user_swapId: { S: user_swapId } },
      }),
    );
    await removeUserFromTargetWaitlist(client, overridesTable, tenantId, swap);
    console.info(
      JSON.stringify({
        source: "swapCutoffReconcile",
        tenantId,
        swapId,
        user: swap.user,
        fromCourseId: swap.fromCourseId,
        fromDate: swap.fromDate,
      }),
    );
  }

  return kept;
}
