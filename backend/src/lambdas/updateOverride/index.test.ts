import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, UpdateItemCommand, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
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

    const event: APIGatewayProxyEvent = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({
        participants: ['Luna', 'Kai'],
        swapped: ['Luna'],
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'PUT',
      isBase64Encoded: false,
      path: '/overrides/1/2025-10-01',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      requestContext: {} as any,
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Override updated' });
    expect(dynamoMock.calls()).toHaveLength(1);

    // Zugriff auf das Input-Objekt des Commands (typisiert!)
    const call = dynamoMock.call(0).args[0].input as UpdateItemCommandInput;

    expect(call.TableName).toBe('yogaswap-backend-demo-courseOverrides-table');
    expect(call.Key).toEqual({
      tenantId: { S: 'default-tenant' },
      courseId_date: { S: '1_2025-10-01' },
    });
    expect(call.UpdateExpression).toBe(
      'SET #participants = :participants, #swapped = :swapped, #actorUserId = :actorUserId, #actingForUserId = :actingForUserId',
    );
    expect(call.ExpressionAttributeNames).toEqual({
      '#participants': 'participants',
      '#swapped': 'swapped',
      '#actorUserId': 'actorUserId',
      '#actingForUserId': 'actingForUserId',
    });
    expect(call.ExpressionAttributeValues).toEqual({
      ':participants': { L: [{ S: 'Luna' }, { S: 'Kai' }] },
      ':swapped': { L: [{ S: 'Luna' }] },
      ':actorUserId': { NULL: true },
      ':actingForUserId': { NULL: true },
    });
  });

  it('should return 400 for missing courseId or date', async () => {
    const event: APIGatewayProxyEvent = {
      pathParameters: { courseId: '1' },
      body: JSON.stringify({ participants: ['Luna'] }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'PUT',
      isBase64Encoded: false,
      path: '/overrides/1',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      requestContext: {} as any,
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing courseId or date' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should return 400 for invalid participants array', async () => {
    const event: APIGatewayProxyEvent = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({ participants: ['Luna', 123] }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'PUT',
      isBase64Encoded: false,
      path: '/overrides/1/2025-10-01',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      requestContext: {} as any,
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid participants array');
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should return 400 for no fields to update', async () => {
    const event: APIGatewayProxyEvent = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({}),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'PUT',
      isBase64Encoded: false,
      path: '/overrides/1/2025-10-01',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      requestContext: {} as any,
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'No fields to update' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should handle DynamoDB errors gracefully', async () => {
    dynamoMock.on(UpdateItemCommand).rejects(new Error('DynamoDB failure'));

    const event: APIGatewayProxyEvent = {
      pathParameters: { courseId: '1', date: '2025-10-01' },
      body: JSON.stringify({ participants: ['Luna'] }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'PUT',
      isBase64Encoded: false,
      path: '/overrides/1/2025-10-01',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: '',
      requestContext: {} as any,
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Failed to update override' });
    expect(dynamoMock.calls()).toHaveLength(1);
  });
});
