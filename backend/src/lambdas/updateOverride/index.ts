import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { resolveLegacyCourseIdFromPathSegment } from '../shared/courseUid';

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log('updateOverride tenant context', { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "update_override",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const coursesTable = process.env.COURSES_TABLE;
  const rawCourseId = event.pathParameters?.courseId?.trim();
  const date = event.pathParameters?.date?.trim();

  try {
    if (!overridesTable || !coursesTable) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OVERRIDES_TABLE or COURSES_TABLE env var is not set' }),
      };
    }
    if (!rawCourseId || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    const resolvedPath = await resolveLegacyCourseIdFromPathSegment(
      client,
      coursesTable,
      tenantId,
      rawCourseId,
    );
    if (!resolvedPath.ok) {
      return { statusCode: resolvedPath.statusCode, body: resolvedPath.body };
    }
    const legacyCourseId = resolvedPath.legacyCourseId;

    const updates = JSON.parse(event.body || '{}');

    let updateExpression = 'SET';
    const expressionAttributeValues: Record<string, any> = {};
    const expressionAttributeNames: Record<string, string> = {};

    // Validierung und Mapping für participants
    if (updates.participants) {
      if (!Array.isArray(updates.participants) || updates.participants.some((p: any) => typeof p !== 'string')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid participants array' }) };
      }
      updateExpression += ' #participants = :participants,';
      expressionAttributeNames['#participants'] = 'participants';
      expressionAttributeValues[':participants'] = { L: updates.participants.map((p: string) => ({ S: p })) };
    }

    // Validierung und Mapping für swapped
    if (updates.swapped) {
      if (!Array.isArray(updates.swapped) || updates.swapped.some((s: any) => typeof s !== 'string')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid swapped array' }) };
      }
      updateExpression += ' #swapped = :swapped,';
      expressionAttributeNames['#swapped'] = 'swapped';
      expressionAttributeValues[':swapped'] = { L: updates.swapped.map((s: string) => ({ S: s })) };
    }

    // Validierung und Mapping für waitlist
    if (updates.waitlist) {
      if (!Array.isArray(updates.waitlist) || updates.waitlist.some((w: any) => typeof w !== 'string')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid waitlist array' }) };
      }
      updateExpression += ' #waitlist = :waitlist,';
      expressionAttributeNames['#waitlist'] = 'waitlist';
      expressionAttributeValues[':waitlist'] = { L: updates.waitlist.map((w: string) => ({ S: w })) };
    }

    if (updateExpression === 'SET') {
      return { statusCode: 400, body: JSON.stringify({ error: 'No fields to update' }) };
    }

    updateExpression += ' #actorUserId = :actorUserId, #actingForUserId = :actingForUserId,';
    expressionAttributeNames['#actorUserId'] = 'actorUserId';
    expressionAttributeNames['#actingForUserId'] = 'actingForUserId';
    expressionAttributeValues[':actorUserId'] = userId ? { S: userId } : { NULL: true };
    expressionAttributeValues[':actingForUserId'] = actingForUserId ? { S: actingForUserId } : { NULL: true };

    updateExpression = updateExpression.slice(0, -1); // Entferne letztes Komma

    const courseId_date = `${legacyCourseId}_${date}`;
    await client.send(
      new UpdateItemCommand({
        TableName: overridesTable,
        Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    return { statusCode: 200, body: JSON.stringify({ message: 'Override updated' }) };
  } catch (error) {
    console.error('Error updating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update override' }) };
  }
};
