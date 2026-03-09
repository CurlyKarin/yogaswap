import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });

const DEFAULT_TENANT_ID = 'default-tenant';

type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  const userId =
    event.requestContext?.authorizer?.principalId ??
    event.queryStringParameters?.user ??
    null;

  const tenantId =
    event.headers?.['x-tenant-id'] ??
    event.headers?.['X-Tenant-ID'] ??
    DEFAULT_TENANT_ID;

  return {
    tenantId,
    userId: userId ?? undefined,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId } = getTenantContext(event);
  console.log('updateOverride tenant context', { tenantId, userId });
  const tableName = process.env.OVERRIDES_TABLE;
  const courseId = event.pathParameters?.courseId;
  const date = event.pathParameters?.date;
  const updates = JSON.parse(event.body || '{}');

  try {
    if (!courseId || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

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

    updateExpression = updateExpression.slice(0, -1); // Entferne letztes Komma

    const courseId_date = `${courseId}_${date}`;
    await client.send(
      new UpdateItemCommand({
        TableName: tableName,
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