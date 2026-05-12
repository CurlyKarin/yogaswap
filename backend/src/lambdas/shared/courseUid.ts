import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";

/** Global Secondary Index auf der Courses-Tabelle (tenantId + courseUid). */
export const GSI_COURSE_UID = "GSI_CourseUid";

/**
 * UUID v4 im Pfad (RFC 4122), case-insensitive Erkennung für Lookup.
 * Keine Legacy-Zahlenstrings wie "12345" (zu kurz / kein Muster).
 */
export const COURSE_UID_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Neue stabile technische Kurs-ID (UUID v4). */
export function generateCourseUid(): string {
  return randomUUID();
}

export function looksLikeCourseUidPathSegment(segment: string): boolean {
  return COURSE_UID_PATH_REGEX.test(segment.trim());
}

export type ResolveLegacyCourseIdFromPathResult =
  | { ok: true; legacyCourseId: string }
  | { ok: false; statusCode: number; body: string };

/**
 * API-Pfad `{courseId}`: entweder Legacy-Kurs-ID (String, z. B. `"42"`) oder `courseUid` (UUID).
 * UUID wird über GSI_CourseUid in die Dynamo-SK `courseId` aufgelöst.
 */
export async function resolveLegacyCourseIdFromPathSegment(
  client: DynamoDBClient,
  coursesTable: string,
  tenantId: string,
  rawSegment: string | undefined,
): Promise<ResolveLegacyCourseIdFromPathResult> {
  const segment = rawSegment?.trim();
  if (!segment) {
    return {
      ok: false,
      statusCode: 400,
      body: JSON.stringify({ error: "Missing courseId in path" }),
    };
  }

  if (!looksLikeCourseUidPathSegment(segment)) {
    return { ok: true, legacyCourseId: segment };
  }

  const uidNormalized = segment.trim().toLowerCase();
  try {
    const resp = await client.send(
      new QueryCommand({
        TableName: coursesTable,
        IndexName: GSI_COURSE_UID,
        KeyConditionExpression: "tenantId = :tid AND courseUid = :uid",
        ExpressionAttributeValues: {
          ":tid": { S: tenantId },
          ":uid": { S: uidNormalized },
        },
        Limit: 2,
      }),
    );
    const items = resp.Items ?? [];
    if (items.length === 0) {
      return {
        ok: false,
        statusCode: 404,
        body: JSON.stringify({ error: "Course not found" }),
      };
    }
    const legacy = items[0].courseId?.S?.trim();
    if (!legacy) {
      return {
        ok: false,
        statusCode: 500,
        body: JSON.stringify({ error: "Course record incomplete" }),
      };
    }
    return { ok: true, legacyCourseId: legacy };
  } catch (e) {
    console.error("resolveLegacyCourseIdFromPathSegment Query failed", e);
    return {
      ok: false,
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to resolve course" }),
    };
  }
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
