import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { fetchCourseUidByLegacyCourseId } from '../shared/courseUid';
import { courseCapacityFromDynamoItem, validateParticipantsForCourse } from '../shared/courseCapacityDynamo';

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
    const swapped = override.swapped || [];
    const waitlist = override.waitlist || [];
    const shortNoticeCancellations = override.shortNoticeCancellations || [];

    if (!Array.isArray(participants) || participants.some((p: any) => typeof p !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid participants array' }) };
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
    const capacityError = validateParticipantsForCourse(participants, capacityFields);
    if (capacityError) {
      return { statusCode: 400, body: JSON.stringify({ error: capacityError }) };
    }

    const courseUid = await fetchCourseUidByLegacyCourseId(client, coursesTable, tenantId, legacyCourseId);

    const dynamoItem = {
      tenantId: { S: tenantId },
      courseId_date: { S: courseId_date },
      courseId: { S: legacyCourseId },
      date: { S: override.date },
      participants: { L: participants.map((p: string) => ({ S: p })) },
      swapped: { L: swapped.map((s: string) => ({ S: s })) },
      waitlist: { L: waitlist.map((w: string) => ({ S: w })) },
      shortNoticeCancellations: { L: shortNoticeCancellations.map((w: string) => ({ S: w })) },
      actorUserId: userId ? { S: userId } : { NULL: true },
      actingForUserId: actingForUserId ? { S: actingForUserId } : { NULL: true },
      ...(courseUid ? { courseUid: { S: courseUid } } : {}),
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    return { statusCode: 200, body: JSON.stringify({ message: 'Override created' }) };
  } catch (error) {
    console.error('Error creating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create override' }) };
  }
};