import { handler } from './index';
import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('@aws-sdk/client-dynamodb', () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    PutItemCommand: jest.fn((input) => input),
    GetItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock('@aws-sdk/client-dynamodb');

describe('createSwap Lambda', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SWAPS_TABLE: 'test-swaps', COURSES_TABLE: 'test-courses' };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const baseEvent = (body: any): APIGatewayProxyEvent =>
    ({
      body: JSON.stringify(body),
    } as any);

  test('returns 400 if required fields are missing', async () => {
    const event = baseEvent({ user: 'Anna' }); // missing required fields
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Missing required fields/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('successfully creates a swap', async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          time: { S: '10:00' },
          participants: { L: [{ S: 'Nia' }] },
        },
      })
      .mockResolvedValueOnce({ Item: { courseUid: { S: 'uid-from' } } })
      .mockResolvedValueOnce({ Item: { courseUid: { S: 'uid-to' } } })
      .mockResolvedValueOnce({});
    const event = baseEvent({
      user: 'Nia',
      fromCourseId: 'c1',
      fromDate: '2099-06-15',
      toCourseId: 'c2',
      toDate: '2099-06-20',
      status: 'pending',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Swap created');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-swaps',
        Item: expect.objectContaining({
          tenantId: { S: 'default-tenant' },
          user_swapId: { S: 'Nia#2099-06-15_c1_2099-06-20_c2' },
          user: { S: 'Nia' },
          fromCourseId: { S: 'c1' },
          toCourseId: { S: 'c2' },
          status: { S: 'pending' },
          tenantId_user: { S: 'default-tenant#Nia' },
          actorUserId: { NULL: true },
          actingForUserId: { NULL: true },
          fromCourseUid: { S: 'uid-from' },
          toCourseUid: { S: 'uid-to' },
        }),
      })
    );
  });

  test('returns 500 if body is invalid JSON', async () => {
    const event = { body: 'not valid json' } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Failed to create swap');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('returns 500 if DynamoDB fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB error'));

    const event = baseEvent({
      user: 'Nia',
      fromCourseId: 'c1',
      fromDate: '2099-06-15',
      toCourseId: 'c2',
      toDate: '2099-06-20',
      status: 'pending',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Failed to create swap');
  });

  test('returns 400 when origin is inside cutoff window', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const fromDate = `${year}-${month}-${day}`;
    const soon = new Date(now.getTime() + 30 * 60 * 1000);
    const hh = String(soon.getHours()).padStart(2, '0');
    const mm = String(soon.getMinutes()).padStart(2, '0');
    const fromTime = `${hh}:${mm}`;

    mockSend.mockResolvedValueOnce({
      Item: {
        time: { S: fromTime },
        participants: { L: [{ S: 'Nia' }] },
      },
    });

    const event = baseEvent({
      user: 'Nia',
      fromCourseId: 'c1',
      fromDate,
      toCourseId: 'c2',
      toDate: '2099-06-20',
      status: 'pending',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('kein Tausch');
  });

  test('returns 400 when origin has shortNotice cancellation marker', async () => {
    process.env = {
      ...process.env,
      SWAPS_TABLE: 'test-swaps',
      COURSES_TABLE: 'test-courses',
      OVERRIDES_TABLE: 'test-overrides',
    };

    mockSend
      .mockResolvedValueOnce({
        Item: {
          time: { S: '10:00' },
          participants: { L: [{ S: 'Nia' }] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          courseId: { S: '1' },
          date: { S: '2099-06-15' },
          participants: { L: [{ S: 'Nia' }] },
          swapped: { L: [] },
          waitlist: { L: [] },
          shortNoticeCancellations: { L: [{ S: 'Nia' }] },
        },
      });

    const event = baseEvent({
      user: 'Nia',
      fromCourseId: '1',
      fromDate: '2099-06-15',
      toCourseId: '2',
      toDate: '2099-06-20',
      status: 'pending',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('kein Tausch');
  });
});
