import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.SWAPS_TABLE;
  const swapId = event.pathParameters?.swapId;
  const { status } = JSON.parse(event.body || '{}');
  try {
    if (!swapId || !status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing swapId or status' }) };
    }
    await client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { swapId: { S: swapId } },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': { S: status } },
      })
    );
    return { statusCode: 200, body: JSON.stringify({ message: 'Swap updated' }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update swap' }) };
  }
};