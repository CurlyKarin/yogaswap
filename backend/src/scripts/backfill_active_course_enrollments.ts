/**
 * Backfill #385: Active-Kurse — fehlende offene CourseEnrollments aus `participants[]`.
 *
 * Runbook:
 * - Env: COURSES_TABLE, COURSE_ENROLLMENTS_TABLE, AWS_REGION
 * - Optional: TENANT_ID=… (nur ein Tenant)
 * - Dry-Run: DRY_RUN=1 npm run backfill:active-course-enrollments
 * - Live: npm run backfill:active-course-enrollments
 *
 * Idempotent: nur Personen ohne jegliche Enrollment-Zeile für den Kurs.
 * Geschlossene Historie / Drift im Cache → kein Reopen.
 */
import { PutItemCommand, ScanCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { planMissingOpenEnrollmentsFromParticipants } from "@yogaswap/shared";
import { dynamoClient } from "../lambdas/shared/dynamoClient";
import {
  enrollmentToDynamoItem,
  queryCourseEnrollments,
} from "../lambdas/shared/courseEnrollmentDynamo";

const client = dynamoClient;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const TENANT_FILTER = process.env.TENANT_ID?.trim() || undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

const COURSES_TABLE = requireEnv("COURSES_TABLE");
const COURSE_ENROLLMENTS_TABLE = requireEnv("COURSE_ENROLLMENTS_TABLE");

async function scanAll(tableName: string): Promise<Record<string, AttributeValue>[]> {
  const out: Record<string, AttributeValue>[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const resp = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey,
        ...(TENANT_FILTER
          ? {
              FilterExpression: "tenantId = :tenantId",
              ExpressionAttributeValues: { ":tenantId": { S: TENANT_FILTER } },
            }
          : {}),
      }),
    );
    out.push(...(resp.Items ?? []));
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

async function run(): Promise<void> {
  console.log(
    JSON.stringify({
      dryRun: DRY_RUN,
      courses: COURSES_TABLE,
      enrollments: COURSE_ENROLLMENTS_TABLE,
      tenantId: TENANT_FILTER ?? null,
    }),
  );

  const courseItems = await scanAll(COURSES_TABLE);
  let activeCourses = 0;
  let coursesNeedingPuts = 0;
  let putsPlanned = 0;
  let putsWritten = 0;
  let skippedParticipants = 0;

  for (const item of courseItems) {
    const status = item.status?.S;
    if (status !== "active") continue;
    activeCourses += 1;

    const tenantId = item.tenantId?.S;
    const courseIdRaw = item.id?.N ?? item.courseId?.S;
    if (!tenantId || courseIdRaw == null) continue;
    const courseId = Number(courseIdRaw);
    if (!Number.isFinite(courseId)) continue;

    const participants =
      item.participants?.L?.map((entry) => entry.S ?? "").filter((entry) => entry.length > 0) ?? [];
    if (participants.length === 0) continue;

    const existingEnrollments = await queryCourseEnrollments({
      client,
      tableName: COURSE_ENROLLMENTS_TABLE,
      tenantId,
      courseId,
    });

    const planned = planMissingOpenEnrollmentsFromParticipants({
      course: {
        id: courseId,
        tenantId,
        participants,
        seriesStartDate: item.seriesStartDate?.S,
        visibleFrom: item.visibleFrom?.S,
      },
      existingEnrollments,
      source: "backfill",
      createdAt: new Date().toISOString(),
    });

    skippedParticipants += planned.skippedParticipantIds.length;
    if (planned.puts.length === 0) continue;

    coursesNeedingPuts += 1;
    putsPlanned += planned.puts.length;
    console.info(
      JSON.stringify({
        tenantId,
        courseId,
        wouldCreateOpenEnrollmentFor: planned.addedParticipantIds,
        skippedAlreadyHasEnrollmentRows: planned.skippedParticipantIds,
        putCount: planned.puts.length,
      }),
    );

    if (DRY_RUN) continue;
    for (const enrollment of planned.puts) {
      await client.send(
        new PutItemCommand({
          TableName: COURSE_ENROLLMENTS_TABLE,
          Item: enrollmentToDynamoItem(enrollment, tenantId),
        }),
      );
      putsWritten += 1;
    }
  }

  console.log(
    JSON.stringify({
      dryRun: DRY_RUN,
      activeCourses,
      coursesNeedingPuts,
      putsPlanned,
      putsWritten,
      skippedParticipants,
    }),
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
