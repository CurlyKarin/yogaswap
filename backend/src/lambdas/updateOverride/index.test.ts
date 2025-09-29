import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.OVERRIDES_TABLE = 'yogaswap-backend-demo-courseOverrides-table';
});

describe('updateOverride Lambda', () => {
  it('should update an override successfully', async () => {
    dynamoMock.on(UpdateItemCommand).resolves({});

    const event: Partial<APIGatewayProxyEvent> = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({
        participants: ['Luna', 'Kai'],
        swapped: ['Luna'],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Override updated' });
    expect(dynamoMock.calls()).toHaveLength(1);
    expect(dynamoMock.call(0).args[0].input).toMatchObject({
      TableName: 'yogaswap-backend-demo-courseOverrides-table',
      Key: { courseId: { S: '1' }, date: { S: '2025-10-01' } },
      UpdateExpression: 'SET #participants = :participants, #swapped = :swapped',
      ExpressionAttributeNames: {
        '#participants': 'participants',
        '#swapped': 'swapped',
      },
      ExpressionAttributeValues: {
        ':participants': { S: JSON.stringify(['Luna', 'Kai']) },
        ':swapped': { S: JSON.stringify(['Luna']) },
      },
    });
  });

  it('should return 400 for missing courseId or date', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      pathParameters: { courseId: '1' },
      body: JSON.stringify({ participants: ['Luna'] }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing courseId or date' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should return 400 for no fields to update', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({}),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'No fields to update' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should handle DynamoDB errors', async () => {
    dynamoMock.on(UpdateItemCommand).rejects(new Error('DynamoDB failure'));

    const event: Partial<APIGatewayProxyEvent> = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({ participants: ['Luna'] }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Failed to update override' });
    expect(dynamoMock.calls()).toHaveLength(1);
  });
});