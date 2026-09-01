/**
 * Backfill #317: participantId auf Profilen + Kurs-Referenzen (Enrollments, Swaps, Overrides, courses.participants).
 *
 * Runbook:
 * - Env: PARTICIPANTS_TABLE, MEMBERSHIPS_TABLE, COURSES_TABLE, OVERRIDES_TABLE, SWAPS_TABLE, COURSE_ENROLLMENTS_TABLE
 * - Dry-Run: DRY_RUN=1 npm run backfill:participant-ids
 * - Live: npm run backfill:participant-ids
 *
 * Idempotent: bestehende participantId auf Profilen bleibt; Kurs-Daten nur wenn Wert noch Nickname (kein UUID-Muster).
 */
import {
  DeleteItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { generateParticipantId, looksLikeParticipantId } from "@yogaswap/shared";
import { dynamoClient } from "../lambdas/shared/dynamoClient";
import { enrollmentToDynamoItem, dynamoItemToEnrollment } from "../lambdas/shared/courseEnrollmentDynamo";
import { buildSwapDynamoKeys } from "../lambdas/shared/ringSwapExecution";
import type { Swap } from "@yogaswap/shared";

const client = dynamoClient;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

const PARTICIPANTS_TABLE = requireEnv("PARTICIPANTS_TABLE");
const MEMBERSHIPS_TABLE = requireEnv("MEMBERSHIPS_TABLE");
const COURSES_TABLE = requireEnv("COURSES_TABLE");
const OVERRIDES_TABLE = requireEnv("OVERRIDES_TABLE");
const SWAPS_TABLE = requireEnv("SWAPS_TABLE");
const COURSE_ENROLLMENTS_TABLE = requireEnv("COURSE_ENROLLMENTS_TABLE");

async function scanAll(tableName: string): Promise<Record<string, AttributeValue>[]> {
  const out: Record<string, AttributeValue>[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const resp = await client.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey }),
    );
    out.push(...(resp.Items ?? []));
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

function mapKey(tenantId: string, nickname: string): string {
  return `${tenantId}#${nickname.trim().toLowerCase()}`;
}

async function run(): Promise<void> {
  console.log(JSON.stringify({ dryRun: DRY_RUN, step: "start" }));

  const idMap = new Map<string, string>();
  let profilesUpdated = 0;
  let membershipsUpdated = 0;

  const profiles = await scanAll(PARTICIPANTS_TABLE);
  for (const item of profiles) {
    const tenantId = item.tenantId?.S;
    const userId = item.userId?.S?.trim();
    if (!tenantId || !userId) continue;
    const existing = item.participantId?.S?.trim();
    const participantId = existing && looksLikeParticipantId(existing) ? existing : generateParticipantId();
    idMap.set(mapKey(tenantId, userId), participantId);
    if (!existing) {
      profilesUpdated += 1;
      if (!DRY_RUN) {
        await client.send(
          new UpdateItemCommand({
            TableName: PARTICIPANTS_TABLE,
            Key: { tenantId: { S: tenantId }, userId: { S: userId } },
            UpdateExpression: "SET participantId = :pid",
            ExpressionAttributeValues: { ":pid": { S: participantId } },
          }),
        );
      }
    }
  }

  const memberships = await scanAll(MEMBERSHIPS_TABLE);
  for (const item of memberships) {
    const tenantId = item.tenantId?.S;
    const userId = item.userId?.S?.trim();
    if (!tenantId || !userId) continue;
    if (item.participantId?.S?.trim()) continue;
    const participantId = idMap.get(mapKey(tenantId, userId));
    if (!participantId) continue;
    membershipsUpdated += 1;
    if (!DRY_RUN) {
      await client.send(
        new UpdateItemCommand({
          TableName: MEMBERSHIPS_TABLE,
          Key: { tenantId: { S: tenantId }, userId: { S: userId } },
          UpdateExpression: "SET participantId = :pid",
          ExpressionAttributeValues: { ":pid": { S: participantId } },
        }),
      );
    }
  }

  let coursesUpdated = 0;
  const courses = await scanAll(COURSES_TABLE);
  for (const item of courses) {
    const tenantId = item.tenantId?.S;
    const courseId = item.courseId?.S;
    if (!tenantId || !courseId) continue;
    const participants = item.participants?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? [];
    const next = participants.map((nickname) => {
      if (looksLikeParticipantId(nickname)) return nickname;
      return idMap.get(mapKey(tenantId, nickname)) ?? nickname;
    });
    if (next.join("|") === participants.join("|")) continue;
    coursesUpdated += 1;
    if (!DRY_RUN) {
      await client.send(
        new UpdateItemCommand({
          TableName: COURSES_TABLE,
          Key: { tenantId: { S: tenantId }, courseId: { S: courseId } },
          UpdateExpression: "SET participants = :p",
          ExpressionAttributeValues: {
            ":p": { L: next.map((value) => ({ S: value })) },
          },
        }),
      );
    }
  }

  let enrollmentsRewritten = 0;
  const enrollments = await scanAll(COURSE_ENROLLMENTS_TABLE);
  for (const item of enrollments) {
    const mapped = dynamoItemToEnrollment(item);
    if (!mapped) continue;
    if (looksLikeParticipantId(mapped.participantId)) continue;
    const tenantId = item.tenantId?.S;
    if (!tenantId) continue;
    const participantId = idMap.get(mapKey(tenantId, mapped.participantId)) ?? mapped.participantId;
    if (participantId === mapped.participantId) continue;
    const next = { ...mapped, participantId };
    enrollmentsRewritten += 1;
    if (!DRY_RUN) {
      const oldKey = item.courseId_userId_validFrom?.S;
      await client.send(
        new DeleteItemCommand({
          TableName: COURSE_ENROLLMENTS_TABLE,
          Key: { tenantId: { S: tenantId }, courseId_userId_validFrom: { S: oldKey! } },
        }),
      );
      await client.send(
        new PutItemCommand({
          TableName: COURSE_ENROLLMENTS_TABLE,
          Item: enrollmentToDynamoItem(next, tenantId),
        }),
      );
    }
  }

  let overridesUpdated = 0;
  const overrides = await scanAll(OVERRIDES_TABLE);
  for (const item of overrides) {
    const tenantId = item.tenantId?.S;
    const courseIdDate = item.courseId_date?.S;
    if (!tenantId || !courseIdDate) continue;
    const mapForTenant = (list?: { L?: Array<{ S?: string }> }) =>
      (list?.L ?? []).map((entry) => entry.S ?? "").filter(Boolean);
    const fields = [
      "participants",
      "cancelledParticipants",
      "swapped",
      "waitlist",
      "shortNoticeCancellations",
    ] as const;
    const updates: Record<string, AttributeValue> = {};
    let changed = false;
    for (const field of fields) {
      const current = mapForTenant(item[field] as { L?: Array<{ S?: string }> } | undefined);
      const next = current.map((nickname) => {
        if (looksLikeParticipantId(nickname)) return nickname;
        return idMap.get(mapKey(tenantId, nickname)) ?? nickname;
      });
      if (next.join("|") !== current.join("|")) {
        changed = true;
        updates[field] = { L: next.map((value) => ({ S: value })) };
      }
    }
    if (!changed) continue;
    overridesUpdated += 1;
    if (!DRY_RUN) {
      const values = Object.fromEntries(
        Object.entries(updates).map(([_, value], index) => [`:v${index}`, value]),
      );
      const expression = `SET ${Object.keys(updates)
        .map((key, index) => `#f${index} = :v${index}`)
        .join(", ")}`;
      await client.send(
        new UpdateItemCommand({
          TableName: OVERRIDES_TABLE,
          Key: { tenantId: { S: tenantId }, courseId_date: { S: courseIdDate } },
          UpdateExpression: expression,
          ExpressionAttributeNames: Object.fromEntries(
            Object.keys(updates).map((key, index) => [`#f${index}`, key]),
          ),
          ExpressionAttributeValues: values,
        }),
      );
    }
  }

  let swapsRewritten = 0;
  const swaps = await scanAll(SWAPS_TABLE);
  for (const item of swaps) {
    const tenantId = item.tenantId?.S;
    const oldUserSwapId = item.user_swapId?.S;
    const user = item.user?.S ?? item.participantId?.S;
    if (!tenantId || !oldUserSwapId || !user) continue;
    if (looksLikeParticipantId(user)) continue;
    const participantId = idMap.get(mapKey(tenantId, user)) ?? user;
    const swap: Swap = {
      participantId,
      fromCourseId: Number(item.fromCourseId?.S ?? item.fromCourseId?.N ?? 0),
      fromDate: item.fromDate?.S ?? "",
      toCourseId: Number(item.toCourseId?.S ?? item.toCourseId?.N ?? 0),
      toDate: item.toDate?.S ?? "",
      status: (item.status?.S as Swap["status"]) ?? "pending",
      ...(item.fromCourseUid?.S ? { fromCourseUid: item.fromCourseUid.S } : {}),
      ...(item.toCourseUid?.S ? { toCourseUid: item.toCourseUid.S } : {}),
    };
    const { swapId, user_swapId } = buildSwapDynamoKeys(swap);
    if (user_swapId === oldUserSwapId && item.participantId?.S === participantId) continue;
    swapsRewritten += 1;
    if (!DRY_RUN) {
      await client.send(
        new DeleteItemCommand({
          TableName: SWAPS_TABLE,
          Key: { tenantId: { S: tenantId }, user_swapId: { S: oldUserSwapId } },
        }),
      );
      await client.send(
        new PutItemCommand({
          TableName: SWAPS_TABLE,
          Item: {
            ...item,
            tenantId: { S: tenantId },
            user_swapId: { S: user_swapId },
            user: { S: participantId },
            participantId: { S: participantId },
            swapId: { S: swapId },
            tenantId_user: { S: `${tenantId}#${participantId}` },
            fromDate_fromCourseId_status: {
              S: `${swap.fromDate}_${swap.fromCourseId}_${swap.status}`,
            },
            toDate_toCourseId_status: {
              S: `${swap.toDate}_${swap.toCourseId}_${swap.status}`,
            },
          },
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      dryRun: DRY_RUN,
      profilesUpdated,
      membershipsUpdated,
      coursesUpdated,
      enrollmentsRewritten,
      overridesUpdated,
      swapsRewritten,
      idMapSize: idMap.size,
    }),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
