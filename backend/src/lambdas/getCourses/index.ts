import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await client.send(
      new ScanCommand({
        TableName: process.env.COURSES_TABLE,
        ConsistentRead: true,
      })
    );

    const courses = (result.Items || []).map((item) => ({
      id: Number(item.id.N!),
      name: item.name.S!,
      weekday: item.weekday.S!,
      time: item.time.S!,
      capacity: Number(item.capacity.N!),
      participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
      dates: item.dates.L ? item.dates.L.map((d: any) => d.S) : [],
    }));

    return { statusCode: 200, body: JSON.stringify(courses) };
  } catch (error) {
    console.error('Error getting courses:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to get courses' }) };
  }
};