import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";

/** Neue stabile technische Kurs-ID (UUID v4). */
export function generateCourseUid(): string {
  return randomUUID();
}

/**
 * Liest `courseUid` aus dem Kurs-Datensatz (Legacy-Schlüssel: tenantId + courseId).
 */
export async function fetchCourseUidByLegacyCourseId(
  client: DynamoDBClient,
  coursesTable: string,
  tenantId: string,
  legacyCourseId: string,
): Promise<string | undefined> {
  const resp = await client.send(
    new GetItemCommand({
      TableName: coursesTable,
      Key: {
        tenantId: { S: tenantId },
        courseId: { S: legacyCourseId },
      },
      ConsistentRead: true,
    }),
  );
  const uid = resp.Item?.courseUid?.S?.trim();
  return uid || undefined;
}
