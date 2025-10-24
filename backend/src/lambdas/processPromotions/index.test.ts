import { handler as processPromotions } from './index';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, ScanCommand, UpdateItemCommand, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { Swap, CourseDateOverride, Course } from '@yogaswap/shared';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBClient);

describe('processPromotions', () => {
  beforeAll(() => {
    // Setze Umgebungsvariablen
    process.env.SWAPS_TABLE = 'yogaswap-backend-demo-swaps-table';
    process.env.OVERRIDES_TABLE = 'yogaswap-backend-demo-courseOverrides-table';
    process.env.COURSES_TABLE = 'yogaswap-backend-demo-courses-table';
  });

  beforeEach(() => {
    // Resette Mocks vor jedem Test
    ddbMock.reset();
  });

  it('processes pending swaps correctly for currentUser', async () => {
    // Mock-Daten: Kurse
    ddbMock.on(ScanCommand, { TableName: process.env.COURSES_TABLE }).resolves({
      Items: [
        {
          id: { N: '4' },
          name: { S: 'Yoga Class' },
          weekday: { S: 'Monday' },
          time: { S: '18:00' },
          capacity: { N: '10' },
          participants: { L: [{ S: 'Nia' }, { S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-30' }] },
        },
        {
          id: { N: '5' },
          name: { S: 'Pilates Class' },
          weekday: { S: 'Tuesday' },
          time: { S: '19:00' },
          capacity: { N: '10' },
          participants: { L: [{ S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-31' }] },
        },
      ],
    });

    // Mock-Daten: Swaps
    ddbMock.on(ScanCommand, { TableName: process.env.SWAPS_TABLE }).resolves({
      Items: [
        {
          swapId: { S: '2025-10-30_4_2025-10-31_5' },
          user: { S: 'Nia' },
          fromCourseId: { S: '4' },
          fromDate: { S: '2025-10-30' },
          toCourseId: { S: '5' },
          toDate: { S: '2025-10-31' },
          status: { S: 'pending' },
        },
        {
          swapId: { S: '2025-10-30_4_2025-11-01_5' },
          user: { S: 'Nia' },
          fromCourseId: { S: '4' },
          fromDate: { S: '2025-10-30' },
          toCourseId: { S: '5' },
          toDate: { S: '2025-11-01' },
          status: { S: 'pending' },
        },
      ],
    });

    // Mock-Daten: Overrides
    ddbMock.on(ScanCommand, { TableName: process.env.OVERRIDES_TABLE }).resolves({
      Items: [
        {
          courseId: { S: '5' },
          date: { S: '2025-10-31' },
          participants: { L: [{ S: 'Skye' }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: 'Nia' }] },
        },
      ],
    });

    // Mock DynamoDB-Befehle
    ddbMock.on(UpdateItemCommand).resolves({ Attributes: {} });
    ddbMock.on(PutItemCommand).resolves({});
    ddbMock.on(DeleteItemCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ currentUser: 'Nia' }),
      requestContext: { authorizer: { principalId: 'Nia' } },
    } as any;

    const result = await processPromotions(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      message: 'Promotions processed',
      iterations: 1,
      promoted: 1,
      swaps: expect.any(Array),
      overrides: expect.any(Array),
    });

    // Überprüfe, ob der Swap auf 'active' gesetzt wurde
    expect(body.swaps).toContainEqual(
      expect.objectContaining({
        user: 'Nia',
        fromCourseId: 4,
        fromDate: '2025-10-30',
        toCourseId: 5,
        toDate: '2025-10-31',
        status: 'active',
      })
    );

    // Überprüfe, ob der andere Swap gelöscht wurde
    expect(body.swaps).not.toContainEqual(
      expect.objectContaining({
        fromCourseId: 4,
        fromDate: '2025-10-30',
        toCourseId: 5,
        toDate: '2025-11-01',
      })
    );

    // Überprüfe, ob Nia in die Teilnehmerliste aufgenommen wurde
    expect(body.overrides).toContainEqual(
      expect.objectContaining({
        courseId: 5,
        date: '2025-10-31',
        participants: expect.arrayContaining(['Skye', 'Nia']),
        waitlist: [],
        swapped: expect.arrayContaining(['Nia']),
      })
    );

    // Überprüfe, ob der Ursprung-Override erstellt wurde
    expect(body.overrides).toContainEqual(
      expect.objectContaining({
        courseId: 4,
        date: '2025-10-30',
        participants: expect.arrayContaining(['Skye']),
        swapped: [],
        waitlist: [],
      })
    );

    // Überprüfe DynamoDB-Aufrufe
    expect(ddbMock).toHaveReceivedCommandTimes(ScanCommand, 4); // 3x initial + 2x updated
    expect(ddbMock).toHaveReceivedCommandTimes(UpdateItemCommand, 2); // Ziel- und Ursprung-Override
    expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 1); // Ursprung-Override erstellen
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteItemCommand, 1); // Anderer Swap löschen
  });

  it('does nothing when no free spots are available', async () => {
    ddbMock.on(ScanCommand, { TableName: process.env.COURSES_TABLE }).resolves({
      Items: [
        {
          id: { N: '5' },
          name: { S: 'Pilates Class' },
          weekday: { S: 'Tuesday' },
          time: { S: '19:00' },
          capacity: { N: '1' },
          participants: { L: [{ S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-31' }] },
        },
      ],
    });

    ddbMock.on(ScanCommand, { TableName: process.env.SWAPS_TABLE }).resolves({
      Items: [
        {
          swapId: { S: '2025-10-30_4_2025-10-31_5' },
          user: { S: 'Nia' },
          fromCourseId: { S: '4' },
          fromDate: { S: '2025-10-30' },
          toCourseId: { S: '5' },
          toDate: { S: '2025-10-31' },
          status: { S: 'pending' },
        },
      ],
    });

    ddbMock.on(ScanCommand, { TableName: process.env.OVERRIDES_TABLE }).resolves({
      Items: [
        {
          courseId: { S: '5' },
          date: { S: '2025-10-31' },
          participants: { L: [{ S: 'Skye' }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: 'Nia' }] },
        },
      ],
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ currentUser: 'Nia' }),
      requestContext: { authorizer: { principalId: 'Nia' } },
    } as any;

    const result = await processPromotions(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      message: 'Promotions processed',
      iterations: 1,
      promoted: 0,
      swaps: expect.any(Array),
      overrides: expect.any(Array),
    });

    expect(body.swaps).toContainEqual(
      expect.objectContaining({
        user: 'Nia',
        status: 'pending', // Unverändert, da kein Platz
      })
    );

    expect(ddbMock).toHaveReceivedCommandTimes(UpdateItemCommand, 0);
    expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 0);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteItemCommand, 0);
  });

  it('does nothing when no matching swap exists', async () => {
    ddbMock.on(ScanCommand, { TableName: process.env.COURSES_TABLE }).resolves({
      Items: [
        {
          id: { N: '5' },
          name: { S: 'Pilates Class' },
          weekday: { S: 'Tuesday' },
          time: { S: '19:00' },
          capacity: { N: '10' },
          participants: { L: [{ S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-31' }] },
        },
      ],
    });

    ddbMock.on(ScanCommand, { TableName: process.env.SWAPS_TABLE }).resolves({
      Items: [], // Keine passenden Swaps
    });

    ddbMock.on(ScanCommand, { TableName: process.env.OVERRIDES_TABLE }).resolves({
      Items: [
        {
          courseId: { S: '5' },
          date: { S: '2025-10-31' },
          participants: { L: [{ S: 'Skye' }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: 'Nia' }] },
        },
      ],
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ currentUser: 'Nia' }),
      requestContext: { authorizer: { principalId: 'Nia' } },
    } as any;

    const result = await processPromotions(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      message: 'Promotions processed',
      iterations: 1,
      promoted: 0,
    });

    expect(body.swaps).toEqual([]);
    expect(ddbMock).toHaveReceivedCommandTimes(UpdateItemCommand, 0);
    expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 0);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteItemCommand, 0);
  });

  it('handles missing request body', async () => {
    const event: APIGatewayProxyEvent = {} as any;
    const result = await processPromotions(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing request body' });
    expect(ddbMock).toHaveReceivedCommandTimes(ScanCommand, 0);
  });

  it('handles DynamoDB errors gracefully', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('DynamoDB error'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ currentUser: 'Nia' }),
      requestContext: { authorizer: { principalId: 'Nia' } },
    } as any;

    const result = await processPromotions(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Failed to process promotions' });
  });

  it('stops after max iterations', async () => {
    // Mock: Simuliere Endlosschleife durch viele Swaps
    ddbMock.on(ScanCommand, { TableName: process.env.SWAPS_TABLE }).resolves({
      Items: Array(20).fill({
        swapId: { S: '2025-10-30_4_2025-10-31_5' },
        user: { S: 'Nia' },
        fromCourseId: { S: '4' },
        fromDate: { S: '2025-10-30' },
        toCourseId: { S: '5' },
        toDate: { S: '2025-10-31' },
        status: { S: 'pending' },
      }),
    });

    ddbMock.on(ScanCommand, { TableName: process.env.COURSES_TABLE }).resolves({
      Items: [
        {
          id: { N: '4' },
          name: { S: 'Yoga Class' },
          weekday: { S: 'Monday' },
          time: { S: '18:00' },
          capacity: { N: '10' },
          participants: { L: [{ S: 'Nia' }, { S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-30' }] },
        },
        {
          id: { N: '5' },
          name: { S: 'Pilates Class' },
          weekday: { S: 'Tuesday' },
          time: { S: '19:00' },
          capacity: { N: '10' },
          participants: { L: [{ S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-31' }] },
        },
      ],
    });

    ddbMock.on(ScanCommand, { TableName: process.env.OVERRIDES_TABLE }).resolves({
      Items: [
        {
          courseId: { S: '5' },
          date: { S: '2025-10-31' },
          participants: { L: [{ S: 'Skye' }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: 'Nia' }] },
        },
      ],
    });

    ddbMock.on(UpdateItemCommand).resolves({ Attributes: {} });
    ddbMock.on(PutItemCommand).resolves({});
    ddbMock.on(DeleteItemCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ currentUser: 'Nia' }),
      requestContext: { authorizer: { principalId: 'Nia' } },
    } as any;

    const result = await processPromotions(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.iterations).toBe(10); // maxIterations
    expect(body.promoted).toBeGreaterThanOrEqual(0);
  });

  it('ignores past course dates', async () => {
    ddbMock.on(ScanCommand, { TableName: process.env.COURSES_TABLE }).resolves({
      Items: [
        {
          id: { N: '5' },
          name: { S: 'Pilates Class' },
          weekday: { S: 'Tuesday' },
          time: { S: '19:00' },
          capacity: { N: '10' },
          participants: { L: [{ S: 'Skye' }] },
          dates: { L: [{ S: '2025-10-24' }] },
        },
      ],
    });

    ddbMock.on(ScanCommand, { TableName: process.env.SWAPS_TABLE }).resolves({
      Items: [
        {
          swapId: { S: '2025-10-23_4_2025-10-24_5' },
          user: { S: 'Nia' },
          fromCourseId: { S: '4' },
          fromDate: { S: '2025-10-23' },
          toCourseId: { S: '5' },
          toDate: { S: '2025-10-24' },
          status: { S: 'pending' },
        },
      ],
    });

    ddbMock.on(ScanCommand, { TableName: process.env.OVERRIDES_TABLE }).resolves({
      Items: [
        {
          courseId: { S: '5' },
          date: { S: '2025-10-24' },
          participants: { L: [{ S: 'Skye' }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: 'Nia' }] },
        },
      ],
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ currentUser: 'Nia' }),
      requestContext: { authorizer: { principalId: 'Nia' } },
    } as any;

    // Mock Date.now() für einen Zeitpunkt nach 2025-10-24 19:00
    jest.spyOn(global, 'Date').mockImplementation(() => new Date('2025-10-24T20:00:00Z') as any);

    const result = await processPromotions(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.promoted).toBe(0); // Keine Promotions, da Kurs in der Vergangenheit
    expect(ddbMock).toHaveReceivedCommandTimes(UpdateItemCommand, 0);
    expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 0);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteItemCommand, 0);

    jest.spyOn(global, 'Date').mockRestore();
  });
});