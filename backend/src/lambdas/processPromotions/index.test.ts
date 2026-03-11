import { handler } from "./index";
import { DynamoDBClient, QueryCommand, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const ddbMock = mockClient(DynamoDBClient);

// Fester „now“ für Tests (wie TEST_NOW in den App-Vitests), damit Datumslogik nicht vom echten Datum abhängt
const TEST_NOW = new Date("2025-09-01T06:00:00.000Z");

const makeEvent = (body?: any) => ({
  body: body ? JSON.stringify(body) : undefined,
} as any);

beforeEach(() => {
  ddbMock.reset();
  jest.useFakeTimers();
  jest.setSystemTime(TEST_NOW);
  process.env.SWAPS_TABLE = "test-swaps";
  process.env.COURSES_TABLE = "test-courses";
  process.env.OVERRIDES_TABLE = "test-overrides";
});

afterEach(() => {
  jest.useRealTimers();
});

test("returns 400 if request body is missing", async () => {
  const event = makeEvent();
  const result = await handler(event);
  expect(result.statusCode).toBe(400);
  const body = JSON.parse(result.body);
  expect(body.error).toContain("Missing request body");
});

test("returns 500 if DynamoDB query throws", async () => {
  ddbMock.on(QueryCommand).rejects(new Error("DynamoDB error"));

  const event = makeEvent({ currentUser: "testuser" });
  const result = await handler(event);
  expect(result.statusCode).toBe(500);
  const body = JSON.parse(result.body);
  expect(body.error).toBe("Failed to process promotions");
});

test("returns 200 if all queries return empty lists", async () => {
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const event = makeEvent({ currentUser: "testuser" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.message).toBe("Promotions processed");
  expect(body.promoted).toBe(0);
  expect(Array.isArray(body.swaps)).toBe(true);
  expect(Array.isArray(body.overrides)).toBe(true);
});

test("returns 200 and can promote when data is in the future (fixed now)", async () => {
  // Mit TEST_NOW = 2025-09-01 sind 2025-10-01-Termine „in der Zukunft“
  const pendingSwap = {
    swapId: { S: "2025-10-01_1_2025-10-02_2" },
    user: { S: "Alice" },
    fromCourseId: { N: "1" },
    fromDate: { S: "2025-10-01" },
    toCourseId: { N: "2" },
    toDate: { S: "2025-10-02" },
    status: { S: "pending" },
  };
  const course = {
    id: { N: "2" },
    name: { S: "Yoga" },
    weekday: { S: "Tuesday" },
    time: { S: "10:00" },
    capacity: { N: "2" },
    participants: { L: [] },
    dates: { L: [{ S: "2025-10-02" }] },
  };
  const overrideWithWaitlist = {
    courseId: { S: "2" },
    date: { S: "2025-10-02" },
    participants: { L: [{ S: "Bob" }] },
    swapped: { L: [] },
    waitlist: { L: [{ S: "Alice" }] },
  };

  ddbMock.on(UpdateItemCommand).resolves({});
  ddbMock.on(PutItemCommand).resolves({});
  // Queries: iter1: pending, courses, overrides; iter2: pending, courses, overrides; final: swaps, overrides
  ddbMock
    .on(QueryCommand)
    .resolvesOnce({ Items: [pendingSwap] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideWithWaitlist] })
    .resolvesOnce({ Items: [] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideWithWaitlist] })
    .resolvesOnce({
      Items: [{ ...pendingSwap, status: { S: "active" } }],
    })
    .resolvesOnce({
      Items: [
        {
          ...overrideWithWaitlist,
          participants: { L: [{ S: "Bob" }, { S: "Alice" }] },
          waitlist: { L: [] },
        },
      ],
    });

  const event = makeEvent({ currentUser: "Alice" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.message).toBe("Promotions processed");
  expect(body.promoted).toBe(1);
  expect(Array.isArray(body.swaps)).toBe(true);
  expect(Array.isArray(body.overrides)).toBe(true);
});
