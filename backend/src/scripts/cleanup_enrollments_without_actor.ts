/**
 * Staging cleanup: löscht CourseEnrollment-Zeilen ohne actorUserId
 * (u. a. fehlerhafte #385-Backfills). Default: Dry-Run.
 *
 * DRY_RUN=1 (default) | DRY_RUN=0 für Live-Delete
 * COURSE_ENROLLMENTS_TABLE=yogaswap-staging-courseEnrollments-table
 */
import { DeleteItemCommand, ScanCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../lambdas/shared/dynamoClient";

const client = dynamoClient;
const table = process.env.COURSE_ENROLLMENTS_TABLE;
if (!table) throw new Error("Missing env: COURSE_ENROLLMENTS_TABLE");
const DRY_RUN = process.env.DRY_RUN !== "0" && process.env.DRY_RUN !== "false";

async function scanAll(): Promise<Record<string, AttributeValue>[]> {
  const out: Record<string, AttributeValue>[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const resp = await client.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey }),
    );
    out.push(...(resp.Items ?? []));
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

async function run(): Promise<void> {
  const items = await scanAll();
  const victims = items.filter((item) => !item.actorUserId?.S?.trim());
  console.log(
    JSON.stringify(
      {
        table,
        dryRun: DRY_RUN,
        total: items.length,
        withoutActorUserId: victims.length,
        sample: victims.slice(0, 20).map((item) => ({
          tenantId: item.tenantId?.S,
          sk: item.courseId_userId_validFrom?.S,
          participantId: item.participantId?.S ?? item.userId?.S,
          source: item.source?.S,
          validUntil: item.validUntil?.S,
          closedAt: item.closedAt?.S,
        })),
      },
      null,
      2,
    ),
  );

  if (DRY_RUN) {
    console.log(JSON.stringify({ hint: "Set DRY_RUN=0 to delete" }));
    return;
  }

  let deleted = 0;
  for (const item of victims) {
    const tenantId = item.tenantId?.S;
    const sk = item.courseId_userId_validFrom?.S;
    if (!tenantId || !sk) continue;
    await client.send(
      new DeleteItemCommand({
        TableName: table,
        Key: {
          tenantId: { S: tenantId },
          courseId_userId_validFrom: { S: sk },
        },
      }),
    );
    deleted += 1;
  }
  console.log(JSON.stringify({ deleted }));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
