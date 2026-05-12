import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { resolveLegacyCourseIdFromPathSegment } from '../shared/courseUid';

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log('deleteOverride tenant context', { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "delete_override",
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

    const courseId_date = `${legacyCourseId}_${date}`;
    console.log('deleteOverride audit', {
      tenantId,
      actorUserId: userId ?? null,
      actingForUserId: actingForUserId ?? null,
      legacyCourseId,
      date,
    });
    await client.send(
      new DeleteItemCommand({
        TableName: overridesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId_date: { S: courseId_date },
        },
      })
    );

    return { statusCode: 200, body: JSON.stringify({ message: 'Override deleted' }) };
  } catch (error) {
    console.error('Error deleting override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete override' }) };
  }
};
