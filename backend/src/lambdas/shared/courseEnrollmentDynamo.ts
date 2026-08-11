import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  buildCourseEnrollmentSortKey,
  type CourseEnrollment,
  type CourseEnrollmentSource,
} from "@yogaswap/shared";

export function enrollmentToDynamoItem(
  enrollment: CourseEnrollment,
  tenantId: string,
): Record<string, AttributeValue> {
  const validFrom = enrollment.validFrom;
  const item: Record<string, AttributeValue> = {
    tenantId: { S: tenantId },
    courseId_userId_validFrom: {
      S: buildCourseEnrollmentSortKey(enrollment.courseId, enrollment.userId, validFrom),
    },
    courseId: { S: String(enrollment.courseId) },
    courseIdNumeric: { N: String(enrollment.courseId) },
    userId: { S: enrollment.userId },
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
  const userId = item.userId?.S;
  const validFrom = item.validFrom?.S;
  if (courseIdRaw == null || !userId || !validFrom) return null;
  const courseId = Number(courseIdRaw);
  if (!Number.isFinite(courseId)) return null;

  const source = item.source?.S as CourseEnrollmentSource | undefined;
  return {
    ...(item.tenantId?.S ? { tenantId: item.tenantId.S } : {}),
    courseId,
    userId,
    validFrom,
    ...(item.validUntil?.S ? { validUntil: item.validUntil.S } : {}),
    ...(item.actorUserId?.S ? { actorUserId: item.actorUserId.S } : {}),
    ...(item.createdAt?.S ? { createdAt: item.createdAt.S } : {}),
    ...(item.closedAt?.S ? { closedAt: item.closedAt.S } : {}),
    ...(source ? { source } : {}),
  };
}
