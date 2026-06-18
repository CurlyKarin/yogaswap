import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock DynamoDB client
const dynamoMock = mockClient(DynamoDBClient);

const mockCourseItem = {
  courseUid: { S: 'course-uid-abc' },
  capacity: { N: '12' },
  overbookLimit: { N: '0' },
};

beforeEach(() => {
  dynamoMock.reset();
  process.env.OVERRIDES_TABLE = 'yogaswap-backend-demo-courseOverrides-table';
  process.env.COURSES_TABLE = 'yogaswap-backend-demo-courses-table';
});

describe('createOverride Lambda', () => {
  it('should create a new override successfully', async () => {
    dynamoMock
      .on(GetItemCommand)
      .resolvesOnce({ Item: mockCourseItem })
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({ Item: mockCourseItem });
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

    expect(dynamoMock.commandCalls(GetItemCommand)).toHaveLength(3);
    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(1);

    expect(dynamoMock.commandCalls(PutItemCommand)[0].args[0].input).toMatchObject({
      TableName: 'yogaswap-backend-demo-courseOverrides-table',
      ConditionExpression: 'attribute_not_exists(courseId_date)',
      Item: {
        tenantId: { S: 'default-tenant' },
        courseId_date: { S: '1_2025-10-01' },
        courseId: { S: '1' },
        courseUid: { S: 'course-uid-abc' },
        date: { S: '2025-10-01' },
        participants: { L: [{ S: 'Luna' }] },
        swapped: { L: [] },
        waitlist: { L: [] },
        actorUserId: { NULL: true },
        actingForUserId: { NULL: true },
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

  it('should return 400 for invalid participants array', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: [123], // invalid type
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid participants array' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should return 400 when participants exceed maxCapacity', async () => {
    dynamoMock.on(GetItemCommand).resolves({
      Item: { ...mockCourseItem, capacity: { N: '1' }, overbookLimit: { N: '0' } },
    });

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['A', 'B'],
        swapped: [],
        waitlist: [],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Maximal 1/);
    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it('should persist anonymousTrialCount when within maxCapacity', async () => {
    dynamoMock
      .on(GetItemCommand)
      .resolvesOnce({
        Item: {
          ...mockCourseItem,
          capacity: { N: '8' },
          overbookLimit: { N: '2' },
          participants: { L: [{ S: 'A' }, { S: 'B' }] },
        },
      })
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({ Item: mockCourseItem });
    dynamoMock.on(PutItemCommand).resolves({});

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['A', 'B'],
        swapped: [],
        waitlist: [],
        anonymousTrialCount: 2,
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(dynamoMock.commandCalls(PutItemCommand)[0].args[0].input.Item?.anonymousTrialCount).toEqual({
      N: '2',
    });
  });

  it('should return 400 when participants plus guests exceed maxCapacity', async () => {
    dynamoMock.on(GetItemCommand).resolves({
      Item: { ...mockCourseItem, capacity: { N: '4' }, overbookLimit: { N: '0' } },
    });

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['A', 'B', 'C'],
        swapped: [],
        waitlist: [],
        anonymousTrialCount: 2,
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Maximal 4/);
    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it('should allow waitlist enrollment when roster matches course participants above capacity', async () => {
    dynamoMock
      .on(GetItemCommand)
      .resolvesOnce({
        Item: {
          ...mockCourseItem,
          capacity: { N: '1' },
          overbookLimit: { N: '0' },
          participants: { L: [{ S: 'A' }, { S: 'B' }] },
        },
      })
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({
        Item: {
          ...mockCourseItem,
          capacity: { N: '1' },
          overbookLimit: { N: '0' },
          participants: { L: [{ S: 'A' }, { S: 'B' }] },
        },
      });
    dynamoMock.on(PutItemCommand).resolves({});

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['A', 'B'],
        swapped: [],
        waitlist: ['Luna'],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(1);
  });

  it('should return 409 when override already exists', async () => {
    dynamoMock
      .on(GetItemCommand)
      .resolvesOnce({ Item: mockCourseItem })
      .resolvesOnce({
        Item: {
          tenantId: { S: 'default-tenant' },
          courseId_date: { S: '1_2025-10-01' },
          courseId: { S: '1' },
          date: { S: '2025-10-01' },
          participants: { L: [{ S: 'Luna' }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: 'Bob' }] },
        },
      });

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        courseId: 1,
        date: '2025-10-01',
        participants: ['Luna'],
        swapped: [],
        waitlist: ['Alice'],
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error).toBe('Override already exists');
    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it('should handle DynamoDB errors gracefully', async () => {
    dynamoMock
      .on(GetItemCommand)
      .resolvesOnce({ Item: mockCourseItem })
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({ Item: mockCourseItem });
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
    expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(1);
  });
});
