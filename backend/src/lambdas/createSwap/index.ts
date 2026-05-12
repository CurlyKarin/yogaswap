import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { fetchCourseUidByLegacyCourseId } from '../shared/courseUid';

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log('createSwap tenant context', { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "create_swap",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;

  const tableName = process.env.SWAPS_TABLE;
  const coursesTable = process.env.COURSES_TABLE;

  try {
    if (!tableName) {
      return { statusCode: 500, body: JSON.stringify({ error: 'SWAPS_TABLE env var is not set' }) };
    }
    if (!coursesTable) {
      return { statusCode: 500, body: JSON.stringify({ error: 'COURSES_TABLE env var is not set' }) };
    }
    const swap = event.body ? JSON.parse(event.body) : {};
    if (!swap.user || !swap.fromCourseId || !swap.fromDate || !swap.toCourseId || !swap.toDate || !swap.status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const fromLegacyId = swap.fromCourseId.toString();
    const toLegacyId = swap.toCourseId.toString();
    const [fromCourseUid, toCourseUid] = await Promise.all([
      fetchCourseUidByLegacyCourseId(client, coursesTable, tenantId, fromLegacyId),
      fetchCourseUidByLegacyCourseId(client, coursesTable, tenantId, toLegacyId),
    ]);

    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    const user_swapId = `${swap.user}#${swapId}`;
    const tenantId_user = `${tenantId}#${swap.user}`;
    const dynamoItem = {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
      user: { S: swap.user },
      swapId: { S: swapId },
      fromCourseId: { S: fromLegacyId },
      fromDate: { S: swap.fromDate },
      toCourseId: { S: toLegacyId },
      toDate: { S: swap.toDate },
      status: { S: swap.status },
      fromDate_fromCourseId_status: { S: `${swap.fromDate}_${swap.fromCourseId}_${swap.status}` },
      toDate_toCourseId_status: { S: `${swap.toDate}_${swap.toCourseId}_${swap.status}` },
      tenantId_user: { S: tenantId_user },
      actorUserId: userId ? { S: userId } : { NULL: true },
      actingForUserId: actingForUserId ? { S: actingForUserId } : { NULL: true },
      ...(fromCourseUid ? { fromCourseUid: { S: fromCourseUid } } : {}),
      ...(toCourseUid ? { toCourseUid: { S: toCourseUid } } : {}),
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    return { statusCode: 200, body: JSON.stringify({ message: 'Swap created' }) };
  } catch (error) {
    console.error('Error creating swap:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create swap' }) };
  }
};