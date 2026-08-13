import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { fetchCourseUidByLegacyCourseId } from '../shared/courseUid';
import { mapOverrideItem, mapStringList, anonymousTrialCountAttribute } from '../shared/overrideDynamo';
import { courseCapacityFromDynamoItem, validateParticipantsForCourse } from '../shared/courseCapacityDynamo';
import { resolveEffectiveTermOccupancy, resolveStemForDate, validateAnonymousTrialCount } from '@yogaswap/shared';
import { queryCourseEnrollments } from '../shared/courseEnrollmentDynamo';

function normalizedRoster(values: string[]): string[] {
  return values.map((entry) => entry.trim().toLowerCase()).sort();
}

function sameParticipantRoster(a: string[], b: string[]): boolean {
  const left = normalizedRoster(a);
  const right = normalizedRoster(b);
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log('createOverride tenant context', { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "create_override",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;
  const tableName = process.env.OVERRIDES_TABLE;
  const coursesTable = process.env.COURSES_TABLE;
  const override = JSON.parse(event.body || '{}');

  try {
    if (!coursesTable) {
      return { statusCode: 500, body: JSON.stringify({ error: 'COURSES_TABLE env var is not set' }) };
    }
    if (!override.courseId || !override.date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    // Validierung der Eingaben
    const participants = override.participants || [];
    const cancelledParticipants = Array.isArray(override.cancelledParticipants)
      ? override.cancelledParticipants
      : undefined;
    const swapped = override.swapped || [];
    const waitlist = override.waitlist || [];
    const shortNoticeCancellations = override.shortNoticeCancellations || [];
    const anonymousTrialCount = override.anonymousTrialCount ?? 0;

    if (!Array.isArray(participants) || participants.some((p: any) => typeof p !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid participants array' }) };
    }
    if (
      cancelledParticipants !== undefined &&
      cancelledParticipants.some((p: any) => typeof p !== 'string')
    ) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid cancelledParticipants array' }) };
    }
    if (!Array.isArray(swapped) || swapped.some((s: any) => typeof s !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid swapped array' }) };
    }
    if (!Array.isArray(waitlist) || waitlist.some((w: any) => typeof w !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid waitlist array' }) };
    }
    if (
      !Array.isArray(shortNoticeCancellations) ||
      shortNoticeCancellations.some((w: any) => typeof w !== 'string')
    ) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid shortNoticeCancellations array' }) };
    }
    const guestCountError = validateAnonymousTrialCount(anonymousTrialCount);
    if (guestCountError) {
      return { statusCode: 400, body: JSON.stringify({ error: guestCountError }) };
    }

    const courseId_date = `${override.courseId}_${override.date}`;
    const legacyCourseId = override.courseId.toString();

    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: { tenantId: { S: tenantId }, courseId: { S: legacyCourseId } },
        ConsistentRead: true,
      }),
    );
    if (!courseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Course not found' }) };
    }
    const capacityFields = courseCapacityFromDynamoItem(courseResp.Item);
    const baseParticipants = mapStringList(courseResp.Item.participants);
    const enrollmentsTable = process.env.COURSE_ENROLLMENTS_TABLE;
    const enrollments = enrollmentsTable
      ? await queryCourseEnrollments({
          client,
          tableName: enrollmentsTable,
          tenantId,
          courseId: Number(legacyCourseId),
        })
      : [];
    const overrideForOccupancy = {
      participants,
      cancelledParticipants,
      swapped,
      shortNoticeCancellations,
    };
    const courseForOccupancy = { id: Number(legacyCourseId), participants: baseParticipants };
    const effective = resolveEffectiveTermOccupancy(
      courseForOccupancy,
      overrideForOccupancy,
      enrollments,
      override.date,
    );
    const stemOnDate = resolveStemForDate(courseForOccupancy, enrollments, override.date);
    const capacityError = validateParticipantsForCourse(
      effective.participants,
      capacityFields,
      anonymousTrialCount,
    );
    const waitlistEnrollmentOnly =
      waitlist.length > 0 &&
      swapped.length === 0 &&
      (cancelledParticipants?.length ?? 0) === 0 &&
      sameParticipantRoster(effective.participants, stemOnDate);
    if (capacityError && !waitlistEnrollmentOnly) {
      return { statusCode: 400, body: JSON.stringify({ error: capacityError }) };
    }

    const existingResp = await client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          tenantId: { S: tenantId },
          courseId_date: { S: courseId_date },
        },
        ConsistentRead: true,
      }),
    );
    if (existingResp.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'Override already exists',
          override: mapOverrideItem(existingResp.Item),
        }),
      };
    }

    const courseUid = await fetchCourseUidByLegacyCourseId(client, coursesTable, tenantId, legacyCourseId);

    const dynamoItem = {
      tenantId: { S: tenantId },
      courseId_date: { S: courseId_date },
      courseId: { S: legacyCourseId },
      date: { S: override.date },
      participants: { L: participants.map((p: string) => ({ S: p })) },
      ...(cancelledParticipants !== undefined
        ? { cancelledParticipants: { L: cancelledParticipants.map((p: string) => ({ S: p })) } }
        : {}),
      swapped: { L: swapped.map((s: string) => ({ S: s })) },
      waitlist: { L: waitlist.map((w: string) => ({ S: w })) },
      shortNoticeCancellations: { L: shortNoticeCancellations.map((w: string) => ({ S: w })) },
      actorUserId: userId ? { S: userId } : { NULL: true },
      actingForUserId: actingForUserId ? { S: actingForUserId } : { NULL: true },
      ...(courseUid ? { courseUid: { S: courseUid } } : {}),
      ...(anonymousTrialCount > 0
        ? { anonymousTrialCount: anonymousTrialCountAttribute(anonymousTrialCount) }
        : {}),
    };

    try {
      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: dynamoItem,
          ConditionExpression: 'attribute_not_exists(courseId_date)',
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Override already exists' }),
        };
      }
      throw error;
    }
    return { statusCode: 200, body: JSON.stringify({ message: 'Override created' }) };
  } catch (error) {
    console.error('Error creating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create override' }) };
  }
};