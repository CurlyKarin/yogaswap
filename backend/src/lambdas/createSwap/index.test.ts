import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.SWAPS_TABLE = 'yogaswap-backend-demo-swaps-table';
  jest.spyOn(console, 'error').mockImplementation(() => {}); // Mock console.error
});

afterEach(() => {
  jest.restoreAllMocks(); // Stelle console.error nach jedem Test wieder her
});

describe('createSwap Lambda', () => {
  it('should create a new swap successfully', async () => {
    dynamoMock.on(PutItemCommand).resolves({});

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        user: 'Luna',
        fromCourseId: 1,
        fromDate: '2025-10-01',
        toCourseId: 2,
        toDate: '2025-10-02',
        status: 'pending',
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Swap created' });
    expect(dynamoMock.calls()).toHaveLength(1);
    expect(dynamoMock.call(0).args[0].input).toMatchObject({
      TableName: 'yogaswap-backend-demo-swaps-table',
      Item: {
        swapId: { S: '2025-10-01#1#2025-10-02#2' },
        user: { S: 'Luna' },
        fromCourseId: { S: '1' },
        fromDate: { S: '2025-10-01' },
        toCourseId: { S: '2' },
        toDate: { S: '2025-10-02' },
        status: { S: 'pending' },
      },
    });
  });

  it('should return 400 for missing required fields', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        user: 'Luna',
        fromCourseId: 1,
        // fromDate, toCourseId, toDate, status fehlen
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing required fields' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should handle DynamoDB errors', async () => {
    dynamoMock.on(PutItemCommand).rejects(new Error('DynamoDB failure'));

    const event: Partial<APIGatewayProxyEvent> = {
      body: JSON.stringify({
        user: 'Luna',
        fromCourseId: 1,
        fromDate: '2025-10-01',
        toCourseId: 2,
        toDate: '2025-10-02',
        status: 'pending',
      }),
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Failed to create swap' });
    expect(dynamoMock.calls()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith('Error creating swap:', expect.any(Error));
  });

//   it('should return 500 for invalid JSON body', async () => {
//     const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
//     const event: Partial<APIGatewayProxyEvent> = {
//       body: 'invalid-json',
//     };

//     const result = await handler(event as APIGatewayProxyEvent);

//     expect(result.statusCode).toBe(500);
//     expect(JSON.parse(result.body)).toEqual({ error: 'Failed to create swap' });
//     expect(dynamoMock.calls()).toHaveLength(0);
//     expect(consoleErrorSpy).toHaveBeenCalledWith(
//       'Error creating swap:',
//       expect.objectContaining({
//         name: 'SyntaxError',
//         message: expect.stringMatching(/Unexpected token.*invalid-json/),
//       })
//     );
//   });
//   it('should return 500 for invalid JSON body', async () => {
//     const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
//     const event: Partial<APIGatewayProxyEvent> = {
//       body: 'invalid-json',
//     };

//     const result = await handler(event as APIGatewayProxyEvent);

//     console.log('Result:', result); // Debugging: Zeige die tatsächliche Antwort
//     console.log('console.error calls:', consoleErrorSpy.mock.calls); // Debugging: Zeige console.error-Aufrufe

//     expect(result.statusCode).toBe(500);
//     expect(JSON.parse(result.body)).toEqual({ error: 'Failed to create swap' });
//     expect(dynamoMock.calls()).toHaveLength(0);
//     expect(consoleErrorSpy).toHaveBeenCalled();
//     expect(consoleErrorSpy.mock.calls[0][0]).toBe('Error creating swap:');
//     expect(consoleErrorSpy.mock.calls[0][1]).toBeInstanceOf(SyntaxError);
//   });

  it('should return 500 for invalid JSON body', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      body: 'invalid-json',
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Failed to create swap' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });
});