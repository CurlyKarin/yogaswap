import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

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
  console.log('createSwap tenant context', { tenantId, userId });

  const tableName = process.env.SWAPS_TABLE;

  try {
    const swap = event.body ? JSON.parse(event.body) : {};
    if (!swap.user || !swap.fromCourseId || !swap.fromDate || !swap.toCourseId || !swap.toDate || !swap.status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    const user_swapId = `${swap.user}#${swapId}`;
    const tenantId_user = `${tenantId}#${swap.user}`;
    const dynamoItem = {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
      user: { S: swap.user },
      swapId: { S: swapId },
      fromCourseId: { S: swap.fromCourseId.toString() },
      fromDate: { S: swap.fromDate },
      toCourseId: { S: swap.toCourseId.toString() },
      toDate: { S: swap.toDate },
      status: { S: swap.status },
      fromDate_fromCourseId_status: { S: `${swap.fromDate}_${swap.fromCourseId}_${swap.status}` },
      toDate_toCourseId_status: { S: `${swap.toDate}_${swap.toCourseId}_${swap.status}` },
      tenantId_user: { S: tenantId_user },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    return { statusCode: 200, body: JSON.stringify({ message: 'Swap created' }) };
  } catch (error) {
    console.error('Error creating swap:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create swap' }) };
  }
};