import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Swap } from '@yogaswap/shared';

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.SWAPS_TABLE;
  try {
    const swap: Swap = JSON.parse(event.body || '{}');
    if (!swap.user || !swap.fromCourseId || !swap.fromDate || !swap.toCourseId || !swap.toDate || !swap.status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }
    const dynamoItem = {
      user: { S: swap.user },
      swapId: { S: `${swap.fromDate}#${swap.fromCourseId}#${swap.toDate}#${swap.toCourseId}` },
      fromDate: { S: swap.fromDate },
      fromCourseId: { S: swap.fromCourseId.toString() },
      toDate: { S: swap.toDate },
      toCourseId: { S: swap.toCourseId.toString() },
      status: { S: swap.status },
      fromDate_fromCourseId_status: { S: `${swap.fromDate}#${swap.fromCourseId}#${swap.status}` },
      toDate_toCourseId_status: { S: `${swap.toDate}#${swap.toCourseId}#${swap.status}` },
    };
    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    return { statusCode: 200, body: JSON.stringify({ message: 'Swap created' }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create swap' }) };
  }
};