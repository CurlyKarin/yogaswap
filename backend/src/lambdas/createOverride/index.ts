import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.OVERRIDES_TABLE;
  const override = JSON.parse(event.body || '{}');

  try {
    if (!override.courseId || !override.date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    const dynamoItem = {
      courseId: { S: override.courseId.toString() },
      date: { S: override.date },
      participants: { S: JSON.stringify(override.participants || []) },
      swapped: { S: JSON.stringify(override.swapped || []) },
      waitlist: { S: JSON.stringify(override.waitlist || []) },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    return { statusCode: 200, body: JSON.stringify({ message: 'Override created' }) };
  } catch (error) {
    console.error('Error creating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create override' }) };
  }
};