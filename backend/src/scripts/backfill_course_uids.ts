/**
 * Backfill für #124: Setzt `courseUid` auf Kursen und ergänzt Referenzen in Overrides/Swaps.
 *
 * Runbook:
 * - Env: COURSES_TABLE, OVERRIDES_TABLE, SWAPS_TABLE (wie Deploy), AWS_REGION
 * - Dry-Run: DRY_RUN=1 npm run backfill:course-uids
 * - Live: npm run backfill:course-uids
 *
 * Idempotent: bestehende courseUid wird nicht überschrieben; Override/Swap nur wenn UID fehlt.
 */
import {
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../lambdas/shared/dynamoClient";
import { generateCourseUid } from "../lambdas/shared/courseUid";

const client = dynamoClient;

const COURSES_TABLE = process.env.COURSES_TABLE ?? "";
const OVERRIDES_TABLE = process.env.OVERRIDES_TABLE ?? "";
const SWAPS_TABLE = process.env.SWAPS_TABLE ?? "";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

async function scanAll(tableName: string): Promise<Record<string, AttributeValue>[]> {
  const out: Record<string, AttributeValue>[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const resp = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey,
      }),
    );
    out.push(...(resp.Items ?? []));
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

async function run(): Promise<void> {
  if (!COURSES_TABLE || !OVERRIDES_TABLE || !SWAPS_TABLE) {
    throw new Error("Set COURSES_TABLE, OVERRIDES_TABLE, SWAPS_TABLE");
  }
  console.log(
    JSON.stringify({
      dryRun: DRY_RUN,
      courses: COURSES_TABLE,
      overrides: OVERRIDES_TABLE,
      swaps: SWAPS_TABLE,
    }),
  );

  const courseUidByTenantAndLegacyId = new Map<string, string>();

  const courseItems = await scanAll(COURSES_TABLE);
  let coursesUpdated = 0;
  for (const item of courseItems) {
    const tenantId = item.tenantId?.S;
    const legacyId = item.courseId?.S;
    if (!tenantId || !legacyId) continue;
    const existing = item.courseUid?.S?.trim();
    const mapKey = `${tenantId}#${legacyId}`;
    if (existing) {
      courseUidByTenantAndLegacyId.set(mapKey, existing);
      continue;
    }
    const uid = generateCourseUid();
    courseUidByTenantAndLegacyId.set(mapKey, uid);
    coursesUpdated += 1;
    if (!DRY_RUN) {
      await client.send(
        new UpdateItemCommand({
          TableName: COURSES_TABLE,
          Key: {
            tenantId: { S: tenantId },
            courseId: { S: legacyId },
          },
          UpdateExpression: "SET courseUid = :uid",
          ExpressionAttributeValues: {
            ":uid": { S: uid },
          },
        }),
      );
    }
  }

  const overrideItems = await scanAll(OVERRIDES_TABLE);
  let overridesUpdated = 0;
  for (const item of overrideItems) {
    const tenantId = item.tenantId?.S;
    const legacyCourseId = item.courseId?.S;
    if (!tenantId || !legacyCourseId) continue;
    if (item.courseUid?.S?.trim()) continue;
    const uid = courseUidByTenantAndLegacyId.get(`${tenantId}#${legacyCourseId}`);
    const cidDate = item.courseId_date?.S?.trim();
    if (!cidDate) {
      console.warn(
        JSON.stringify({
          warn: "override_missing_courseId_date",
          tenantId,
          legacyCourseId,
        }),
      );
      continue;
    }
    if (!uid) {
      console.warn(
        JSON.stringify({
          warn: "override_without_course_uid_mapping",
          tenantId,
          legacyCourseId,
          courseId_date: cidDate,
        }),
      );
      continue;
    }
    overridesUpdated += 1;
    if (!DRY_RUN) {
      await client.send(
        new UpdateItemCommand({
          TableName: OVERRIDES_TABLE,
          Key: {
            tenantId: { S: tenantId },
            courseId_date: { S: cidDate },
          },
          UpdateExpression: "SET courseUid = :uid",
          ExpressionAttributeValues: {
            ":uid": { S: uid },
          },
        }),
      );
    }
  }

  const swapItems = await scanAll(SWAPS_TABLE);
  let swapsUpdated = 0;
  for (const item of swapItems) {
    const tenantId = item.tenantId?.S;
    const fromId = item.fromCourseId?.S;
    const toId = item.toCourseId?.S;
    if (!tenantId || !fromId || !toId) continue;
    const userSwapKey = item.user_swapId?.S?.trim();
    if (!userSwapKey) {
      continue;
    }
    const fromUid =
      item.fromCourseUid?.S?.trim() ||
      courseUidByTenantAndLegacyId.get(`${tenantId}#${fromId}`);
    const toUid =
      item.toCourseUid?.S?.trim() || courseUidByTenantAndLegacyId.get(`${tenantId}#${toId}`);
    const needFrom = !item.fromCourseUid?.S?.trim() && !!fromUid;
    const needTo = !item.toCourseUid?.S?.trim() && !!toUid;
    if (!needFrom && !needTo) continue;
    swapsUpdated += 1;
    if (!DRY_RUN) {
      const sets: string[] = [];
      const values: Record<string, AttributeValue> = {};
      if (needFrom && fromUid) {
        sets.push("fromCourseUid = :fromUid");
        values[":fromUid"] = { S: fromUid };
      }
      if (needTo && toUid) {
        sets.push("toCourseUid = :toUid");
        values[":toUid"] = { S: toUid };
      }
      if (sets.length === 0) continue;
      await client.send(
        new UpdateItemCommand({
          TableName: SWAPS_TABLE,
          Key: {
            tenantId: { S: tenantId },
            user_swapId: { S: userSwapKey },
          },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ExpressionAttributeValues: values,
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      done: true,
      coursesUpdated,
      overridesUpdated,
      swapsUpdated,
      dryRun: DRY_RUN,
    }),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
