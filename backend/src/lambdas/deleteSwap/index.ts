import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.SWAPS_TABLE;
  const swapId = event.pathParameters?.swapId;
  try {
    if (!swapId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing swapId' }) };
    }
    await client.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: { swapId: { S: swapId } },
      })
    );
    return { statusCode: 200, body: JSON.stringify({ message: 'Swap deleted' }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete swap' }) };
  }
};