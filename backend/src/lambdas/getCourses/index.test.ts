import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { deriveVisibleDates } from "../shared/courseDates";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend, PutItemCommand } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("getCourses Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, COURSES_TABLE: "test-courses" };
    mockSend.mockReset();
    PutItemCommand.mockClear();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(() => {
    jest.useRealTimers();
  });

  const makeEvent = (): APIGatewayProxyEvent => ({} as any);

  test("returns list of courses successfully", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          id: { N: "1" },
          courseId: { S: "1" },
          name: { S: "Yoga" },
          weekday: { S: "Monday" },
          time: { S: "10:00" },
          capacity: { N: "12" },
          status: { S: "draft" },
          participants: { L: [{ S: "Anna" }, { S: "Ben" }] },
          dates: { L: [{ S: "2025-10-01" }, { S: "2025-10-08" }] },
        },
      ],
    });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toEqual([
      {
        id: 1,
        courseId: "1",
        name: "Yoga",
        weekday: "Monday",
        time: "10:00",
        capacity: 12,
        overbookLimit: 0,
        status: "draft",
        excludedDates: [],
        includedDates: [],
        visibleDates: ["2025-10-01", "2025-10-08"],
        participants: ["Anna", "Ben"],
        dates: ["2025-10-01", "2025-10-08"],
      },
    ]);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-courses",
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: "default-tenant" } },
        ConsistentRead: true,
      })
    );
  });

  test("uses tenantId from x-tenant-id header", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const eventWithHeader = {
      headers: {
        "x-tenant-id": "custom-studio"
      }
    } as any;

    await handler(eventWithHeader);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: "custom-studio" } },
      })
    );
  });

  test("returns empty array if no items found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Failed to get courses");
  });

  test("reconciles active bounded_series without future dates to inactive on read", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    mockSend
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            id: { N: "3" },
            courseId: { S: "3" },
            name: { S: "Abgelaufen" },
            weekday: { S: "Mon" },
            time: { S: "10:00" },
            capacity: { N: "10" },
            status: { S: "active" },
            planningMode: { S: "bounded_series" },
            visibilityMode: { S: "fixed_window" },
            seriesStartDate: { S: "2020-01-01" },
            seriesEndDate: { S: "2020-01-31" },
            visibleFrom: { S: "2020-01-01" },
            visibleUntil: { S: "2020-01-31" },
            participants: { L: [] },
            dates: { L: [{ S: "2020-01-06" }] },
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body[0].status).toBe("inactive");
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          status: { S: "inactive" },
        }),
      }),
    );

    jest.useRealTimers();
  });

  test("bleibt aktiv am Blockend-Tag nach Kurszeit bis Nachlauf abläuft", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2026, 4, 18, 19, 0, 0)));

    mockSend
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            id: { N: "4" },
            courseId: { S: "4" },
            name: { S: "Ein Termin heute" },
            weekday: { S: "Mon" },
            time: { S: "18:00" },
            capacity: { N: "10" },
            status: { S: "active" },
            planningMode: { S: "bounded_series" },
            visibilityMode: { S: "fixed_window" },
            seriesStartDate: { S: "2026-05-18" },
            seriesEndDate: { S: "2026-05-18" },
            visibleFrom: { S: "2026-05-18" },
            visibleUntil: { S: "2026-05-18" },
            participants: { L: [{ S: "alice" }] },
            dates: { L: [{ S: "2026-05-18" }] },
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)[0].status).toBe("active");
    expect(PutItemCommand).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test("derives visible dates from bounded series with fixed window and exclusions", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          id: { N: "2" },
          courseId: { S: "2" },
          name: { S: "Flow" },
          weekday: { S: "Mon" },
          time: { S: "18:00" },
          capacity: { N: "10" },
          status: { S: "active" },
          planningMode: { S: "bounded_series" },
          visibilityMode: { S: "fixed_window" },
          seriesStartDate: { S: "2026-01-01" },
          seriesEndDate: { S: "2026-01-31" },
          visibleFrom: { S: "2026-01-05" },
          visibleUntil: { S: "2026-01-20" },
          excludedDates: { L: [{ S: "2026-01-12" }] },
          includedDates: { L: [{ S: "2026-01-14" }] },
          participants: { L: [] },
          dates: { L: [{ S: "2026-12-31" }] },
        },
      ],
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body[0]).toEqual(
      expect.objectContaining({
        id: 2,
        courseId: "2",
        planningMode: "bounded_series",
        visibilityMode: "fixed_window",
        excludedDates: ["2026-01-12"],
        includedDates: ["2026-01-14"],
        visibleDates: ["2026-01-05", "2026-01-14", "2026-01-19"],
        dates: ["2026-01-05", "2026-01-14", "2026-01-19"],
      }),
    );
  });

  test("derives rolling_continuous dates from tenant rollingPlanningHorizonWeeks", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-19T12:00:00.000Z"));
    process.env.TENANTS_TABLE = "test-tenants";

    const now = new Date("2026-05-19T12:00:00.000Z");
    const horizonWeeks = 3;
    const expectedDates = deriveVisibleDates({
      planningMode: "rolling_continuous",
      visibilityMode: "rolling_horizon",
      weekday: "Mon",
      rollingPlanningHorizonWeeks: horizonWeeks,
      excludedDates: [],
      includedDates: [],
      fallbackDates: [],
      now,
    });

    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Studio" },
          settings: {
            M: {
              rollingPlanningHorizonWeeks: { N: String(horizonWeeks) },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            id: { N: "5" },
            courseId: { S: "5" },
            name: { S: "Rolling" },
            weekday: { S: "Mon" },
            time: { S: "10:00" },
            capacity: { N: "10" },
            status: { S: "draft" },
            planningMode: { S: "rolling_continuous" },
            visibilityMode: { S: "rolling_horizon" },
            participants: { L: [] },
            dates: { L: [{ S: "2099-01-06" }] },
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body[0]).toEqual(
      expect.objectContaining({
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        visibleDates: expectedDates,
        dates: expectedDates,
      }),
    );
    expect(expectedDates.length).toBeGreaterThan(0);

    expect(GetItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-tenants",
        Key: { tenantId: { S: "default-tenant" } },
      }),
    );
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          dates: { L: expectedDates.map((entry) => ({ S: entry })) },
        }),
      }),
    );

    jest.useRealTimers();
  });
});
