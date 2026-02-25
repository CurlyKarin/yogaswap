import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.OVERRIDES_TABLE = 'yogaswap-backend-demo-courseOverrides-table';
});

describe('getOverrides Lambda', () => {
  it('should return all overrides', async () => {
    dynamoMock.on(ScanCommand).resolves({
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
    });
  });

  it('should filter by courseId', async () => {
    dynamoMock.on(ScanCommand).resolves({
      Items: [
        {
          courseId: { S: '1' },
          date: { S: '2025-10-01' },
          participants: { L: [{ S: 'Luna' }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
        {
          courseId: { S: '2' },
          date: { S: '2025-10-02' },
          participants: { L: [{ S: 'Kai' }] },
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
  });

  it('should filter by sinceDate', async () => {
    dynamoMock.on(ScanCommand).resolves({
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

  it('should return empty array when courseId is invalid (non-numeric)', async () => {
    dynamoMock.on(ScanCommand).resolves({
      Items: [
        {
          courseId: { S: '1' },
          date: { S: '2025-10-01' },
          participants: { L: [] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      ],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: { courseId: 'abc' },
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should handle DynamoDB errors', async () => {
    dynamoMock.on(ScanCommand).rejects(new Error('DynamoDB failure'));

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {},
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal Server Error' });
    expect(dynamoMock.calls()).toHaveLength(1);
  });
});
