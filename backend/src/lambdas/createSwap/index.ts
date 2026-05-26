import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { canCreateSwapFromOrigin } from '@yogaswap/shared';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { fetchCourseUidByLegacyCourseId } from '../shared/courseUid';
import { loadTenantSettings } from '../shared/tenantSettingsLoader';
import { mapOverrideItem, mapStringList } from '../shared/overrideDynamo';

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
  const overridesTable = process.env.OVERRIDES_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;

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
    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: { tenantId: { S: tenantId }, courseId: { S: fromLegacyId } },
        ConsistentRead: true,
      }),
    );
    if (!courseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Origin course not found' }) };
    }
    const courseTime = courseResp.Item.time?.S ?? '';
    const baseParticipants = mapStringList(courseResp.Item.participants);

    let override;
    if (overridesTable) {
      const courseId_date = `${fromLegacyId}_${swap.fromDate}`;
      const overrideResp = await client.send(
        new GetItemCommand({
          TableName: overridesTable,
          Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
          ConsistentRead: true,
        }),
      );
      if (overrideResp.Item) {
        override = mapOverrideItem(overrideResp.Item);
      }
    }
    const participants = override?.participants ?? baseParticipants;
    const originallyParticipant = baseParticipants.some(
      (p) => p.toLowerCase() === swap.user.toLowerCase(),
    );
    const tenantSettings = tenantsTable
      ? await loadTenantSettings(client, tenantsTable, tenantId)
      : undefined;

    if (
      !canCreateSwapFromOrigin({
        isoDate: swap.fromDate,
        courseTime,
        tenantSettings,
        override,
        userName: swap.user,
        participants,
        originallyParticipant,
      })
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'In diesem Zeitfenster ist kein Tausch vom Ursprungstermin mehr möglich.',
        }),
      };
    }

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
