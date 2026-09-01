import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { QueryCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  buildCourseEnrollmentCoursePrefix,
  buildCourseEnrollmentSortKey,
  type CourseEnrollment,
  type CourseEnrollmentSource,
  normalizeParticipantRef,
} from "@yogaswap/shared";

export function enrollmentToDynamoItem(
  enrollment: CourseEnrollment,
  tenantId: string,
): Record<string, AttributeValue> {
  const validFrom = enrollment.validFrom;
  const item: Record<string, AttributeValue> = {
    tenantId: { S: tenantId },
    courseId_userId_validFrom: {
      S: buildCourseEnrollmentSortKey(enrollment.courseId, enrollment.participantId, validFrom),
    },
    courseId: { S: String(enrollment.courseId) },
    courseIdNumeric: { N: String(enrollment.courseId) },
    participantId: { S: enrollment.participantId },
    validFrom: { S: validFrom },
  };
  if (enrollment.validUntil) item.validUntil = { S: enrollment.validUntil };
  if (enrollment.actorUserId) item.actorUserId = { S: enrollment.actorUserId };
  if (enrollment.createdAt) item.createdAt = { S: enrollment.createdAt };
  if (enrollment.closedAt) item.closedAt = { S: enrollment.closedAt };
  if (enrollment.source) item.source = { S: enrollment.source };
  return item;
}

export function dynamoItemToEnrollment(
  item: Record<string, AttributeValue>,
): CourseEnrollment | null {
  const courseIdRaw = item.courseIdNumeric?.N ?? item.courseId?.S;
  const participantId = item.participantId?.S ?? item.userId?.S;
  const validFrom = item.validFrom?.S;
  if (courseIdRaw == null || !participantId || !validFrom) return null;
  const courseId = Number(courseIdRaw);
  if (!Number.isFinite(courseId)) return null;

  const source = item.source?.S as CourseEnrollmentSource | undefined;
  return {
    ...(item.tenantId?.S ? { tenantId: item.tenantId.S } : {}),
    courseId,
    participantId,
    validFrom,
    ...(item.validUntil?.S ? { validUntil: item.validUntil.S } : {}),
    ...(item.actorUserId?.S ? { actorUserId: item.actorUserId.S } : {}),
    ...(item.createdAt?.S ? { createdAt: item.createdAt.S } : {}),
    ...(item.closedAt?.S ? { closedAt: item.closedAt.S } : {}),
    ...(source ? { source } : {}),
  };
}

/** Query enrollments for a tenant, optionally scoped to one course. */
export async function queryCourseEnrollments(params: {
  client: DynamoDBClient;
  tableName: string;
  tenantId: string;
  courseId?: number;
}): Promise<CourseEnrollment[]> {
  const { client, tableName, tenantId, courseId } = params;
  const expressionValues: Record<string, AttributeValue> = {
    ":tid": { S: tenantId },
  };
  let keyCondition = "tenantId = :tid";
  if (courseId !== undefined) {
    keyCondition += " AND begins_with(courseId_userId_validFrom, :prefix)";
    expressionValues[":prefix"] = { S: buildCourseEnrollmentCoursePrefix(courseId) };
  }

  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      ConsistentRead: true,
    }),
  );

  const enrollments: CourseEnrollment[] = [];
  for (const item of result.Items ?? []) {
    const mapped = dynamoItemToEnrollment(item);
    if (mapped) enrollments.push(mapped);
  }
  return enrollments;
}

/** Prefix query for all segments of one participant in a course. */
export function buildCourseEnrollmentParticipantQueryPrefix(
  courseId: number | string,
  participantId: string,
): string {
  return `${String(courseId)}#${normalizeParticipantRef(participantId)}#`;
}
