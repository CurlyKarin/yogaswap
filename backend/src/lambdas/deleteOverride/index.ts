import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

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

  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: userId ?? undefined,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId } = getTenantContext(event);
  console.log('deleteOverride tenant context', { tenantId, userId });
  const tableName = process.env.OVERRIDES_TABLE;
  const courseId = event.pathParameters?.courseId;
  const date = event.pathParameters?.date;

  try {
    if (!courseId || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    await client.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: {
          courseId: { S: courseId },
          date: { S: date },
        },
      })
    );

    return { statusCode: 200, body: JSON.stringify({ message: 'Override deleted' }) };
  } catch (error) {
    console.error('Error deleting override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete override' }) };
  }
};