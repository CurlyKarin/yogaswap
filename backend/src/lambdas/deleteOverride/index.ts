import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';

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
  const tableName = process.env.OVERRIDES_TABLE;
  const courseId = event.pathParameters?.courseId;
  const date = event.pathParameters?.date;

  try {
    if (!courseId || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    const courseId_date = `${courseId}_${date}`;
    console.log('deleteOverride audit', {
      tenantId,
      actorUserId: userId ?? null,
      actingForUserId: actingForUserId ?? null,
      courseId,
      date,
    });
    await client.send(
      new DeleteItemCommand({
        TableName: tableName,
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