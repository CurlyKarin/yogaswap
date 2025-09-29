import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.OVERRIDES_TABLE = 'yogaswap-backend-demo-courseOverrides-table';
});

describe('createOverride Lambda', () => {
  it('should create a new override successfully', async () => {
    dynamoMock.on(PutItemCommand).resolves({});

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['Luna'],
        swapped: [],
        waitlist: [],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Override created' });
    expect(dynamoMock.calls()).toHaveLength(1);
    expect(dynamoMock.call(0).args[0].input).toMatchObject({
      TableName: 'yogaswap-backend-demo-courseOverrides-table',
      Item: {
        courseId: { S: '1' },
        date: { S: '2025-10-01' },
        participants: { S: JSON.stringify(['Luna']) },
        swapped: { S: JSON.stringify([]) },
        waitlist: { S: JSON.stringify([]) },
      },
    });
  });

  it('should return 400 for missing courseId or date', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        participants: ['Luna'],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing courseId or date' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should handle DynamoDB errors', async () => {
    dynamoMock.on(PutItemCommand).rejects(new Error('DynamoDB failure'));

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['Luna'],
        swapped: [],
        waitlist: [],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Failed to create override' });
    expect(dynamoMock.calls()).toHaveLength(1);
  });
});