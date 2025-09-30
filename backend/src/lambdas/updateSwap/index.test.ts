import { handler } from './index';
import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('@aws-sdk/client-dynamodb', () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    UpdateItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock('@aws-sdk/client-dynamodb');

describe('updateSwap Lambda', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SWAPS_TABLE: 'test-swaps' };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const baseEvent = (swapId: string | null, body: any): APIGatewayProxyEvent =>
    ({
      pathParameters: swapId ? { swapId } : null,
      body: JSON.stringify(body),
    } as any);

  test('returns 400 if swapId is missing', async () => {
    const event = baseEvent(null, { status: 'approved' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Missing swapId or status/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('returns 400 if status is missing', async () => {
    const event = baseEvent('abc#123', {});
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Missing swapId or status/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('successfully updates a swap', async () => {
    mockSend.mockResolvedValueOnce({});
    const event = baseEvent('swap123', { status: 'approved' });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Swap updated');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-swaps',
        Key: { swapId: { S: 'swap123' } },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': { S: 'approved' } },
      })
    );
  });

  test('returns 500 if DynamoDB update fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));
    const event = baseEvent('swap123', { status: 'rejected' });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Failed to update swap');
  });
});
