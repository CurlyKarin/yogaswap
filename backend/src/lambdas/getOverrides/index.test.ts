import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.OVERRIDES_TABLE = 'yogaswap-backend-demo-courseOverrides-table';
});

describe('getOverrides Lambda', () => {
  it('should return all overrides', async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [
        {
          courseId: { S: '1' },
          date: { S: '2025-10-01' },
          participants: { L: [{ S: 'Luna' }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      ],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {},
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        courseId: 1,
        date: '2025-10-01',
        participants: ['Luna'],
        swapped: [],
        waitlist: [],
      },
    ]);
    expect(dynamoMock.calls()).toHaveLength(1);
    expect(dynamoMock.call(0).args[0].input).toMatchObject({
      TableName: 'yogaswap-backend-demo-courseOverrides-table',
      KeyConditionExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': { S: 'default-tenant' } },
    });
  });

  it('should filter by courseId (Query mit begins_with courseId_date)', async () => {
    // Bei courseId=1 liefert die Query nur Items mit courseId_date beginning with "1_"
    dynamoMock.on(QueryCommand).resolves({
      Items: [
        {
          courseId: { S: '1' },
          date: { S: '2025-10-01' },
          participants: { L: [{ S: 'Luna' }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      ],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: { courseId: '1' },
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        courseId: 1,
        date: '2025-10-01',
        participants: ['Luna'],
        swapped: [],
        waitlist: [],
      },
    ]);
    expect(dynamoMock.call(0).args[0].input).toMatchObject({
      KeyConditionExpression: 'tenantId = :tid AND begins_with(courseId_date, :cid)',
      ExpressionAttributeValues: { ':tid': { S: 'default-tenant' }, ':cid': { S: '1_' } },
    });
  });

  it('should filter by sinceDate', async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [
        {
          courseId: { S: '1' },
          date: { S: '2025-09-20' },
          participants: { L: [{ S: 'Luna' }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
        {
          courseId: { S: '1' },
          date: { S: '2025-10-01' },
          participants: { L: [{ S: 'Kai' }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      ],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: { sinceDate: '2025-09-30' },
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        courseId: 1,
        date: '2025-10-01',
        participants: ['Kai'],
        swapped: [],
        waitlist: [],
      },
    ]);
  });

  it('should return empty array when courseId has no overrides', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: { courseId: 'abc' },
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should handle DynamoDB errors', async () => {
    dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB failure'));

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {},
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal Server Error' });
    expect(dynamoMock.calls()).toHaveLength(1);
  });
});
