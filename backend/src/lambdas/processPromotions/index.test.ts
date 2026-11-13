import { handler } from "./index";
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
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

test("skips stale first waitlist entry and promotes next valid pending swap", async () => {
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
  const overrideWithStaleFirstWaitlist = {
    courseId: { S: "2" },
    date: { S: "2025-10-02" },
    participants: { L: [{ S: "Bob" }] },
    swapped: { L: [] },
    waitlist: { L: [{ S: "Ghost" }, { S: "Alice" }] },
  };

  ddbMock.on(UpdateItemCommand).resolves({});
  ddbMock.on(PutItemCommand).resolves({});
  ddbMock
    .on(QueryCommand)
    .resolvesOnce({ Items: [pendingSwap] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideWithStaleFirstWaitlist] })
    .resolvesOnce({ Items: [] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideWithStaleFirstWaitlist] })
    .resolvesOnce({
      Items: [{ ...pendingSwap, status: { S: "active" } }],
    })
    .resolvesOnce({
      Items: [
        {
          ...overrideWithStaleFirstWaitlist,
          participants: { L: [{ S: "Bob" }, { S: "Alice" }] },
          waitlist: { L: [{ S: "Ghost" }] },
        },
      ],
    });

  const event = makeEvent({ currentUser: "nobody" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.promoted).toBe(1);
  expect(Array.isArray(body.overrides)).toBe(true);
});

test("does not promote from waitlist when regular capacity is full even with overbook headroom", async () => {
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
    overbookLimit: { N: "1" },
    participants: { L: [] },
    dates: { L: [{ S: "2025-10-02" }] },
  };
  const overrideAtRegularCapacity = {
    courseId: { S: "2" },
    date: { S: "2025-10-02" },
    participants: { L: [{ S: "Bob" }, { S: "Carol" }] },
    swapped: { L: [] },
    waitlist: { L: [{ S: "Alice" }] },
  };

  ddbMock
    .on(QueryCommand)
    .resolvesOnce({ Items: [pendingSwap] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideAtRegularCapacity] })
    .resolvesOnce({ Items: [pendingSwap] })
    .resolvesOnce({ Items: [overrideAtRegularCapacity] });

  const event = makeEvent({ currentUser: "Alice" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.promoted).toBe(0);
  expect(ddbMock.commandCalls(UpdateItemCommand)).toHaveLength(0);
});

test("does not promote when target term is inside cutoff window", async () => {
  // TEST_NOW = 2025-09-01T06:00:00.000Z; target 06:30 lies inside default 60-minute cutoff.
  // #438: Eintrag wird von der Warteliste genommen (pending Swap gelöscht).
  const pendingSwap = {
    swapId: { S: "2025-09-01_1_2025-09-01_2" },
    user: { S: "Alice" },
    fromCourseId: { N: "1" },
    fromDate: { S: "2025-09-01" },
    toCourseId: { N: "2" },
    toDate: { S: "2025-09-01" },
    status: { S: "pending" },
  };
  const course = {
    id: { N: "2" },
    name: { S: "Yoga" },
    weekday: { S: "Monday" },
    time: { S: "06:30" },
    capacity: { N: "2" },
    participants: { L: [] },
    dates: { L: [{ S: "2025-09-01" }] },
  };
  const overrideWithWaitlist = {
    courseId: { S: "2" },
    date: { S: "2025-09-01" },
    participants: { L: [{ S: "Bob" }] },
    swapped: { L: [] },
    waitlist: { L: [{ S: "Alice" }] },
  };
  const overrideCleared = { ...overrideWithWaitlist, waitlist: { L: [] } };

  ddbMock.on(DeleteItemCommand).resolves({});
  ddbMock.on(UpdateItemCommand).resolves({});
  ddbMock
    .on(QueryCommand)
    .resolvesOnce({ Items: [pendingSwap] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideWithWaitlist] })
    // iteration 2 after expire (changed=true)
    .resolvesOnce({ Items: [] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideCleared] })
    .resolvesOnce({ Items: [] }) // final swaps
    .resolvesOnce({ Items: [overrideCleared] }); // final overrides

  const event = makeEvent({ currentUser: "Alice" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.promoted).toBe(0);
  expect(ddbMock.commandCalls(DeleteItemCommand).length).toBeGreaterThanOrEqual(1);
  expect(ddbMock.commandCalls(UpdateItemCommand).length).toBeGreaterThanOrEqual(1);
});

test("expires waitlist entry when personal buffer undercuts promotion window (#438)", async () => {
  // TEST_NOW 06:00 UTC; Kurs 10:00 → ~4h. Studio-Default 60 erlaubt Promotion,
  // persönlich 300 Min. sperrt und bereinigt Warteliste.
  const pendingSwap = {
    swapId: { S: "2025-09-01_1_2025-09-01_2" },
    user: { S: "Alice" },
    participantId: { S: "Alice" },
    fromCourseId: { N: "1" },
    fromDate: { S: "2025-09-01" },
    toCourseId: { N: "2" },
    toDate: { S: "2025-09-01" },
    status: { S: "pending" },
  };
  const course = {
    id: { N: "2" },
    name: { S: "Yoga" },
    weekday: { S: "Monday" },
    time: { S: "10:00" },
    capacity: { N: "2" },
    participants: { L: [] },
    dates: { L: [{ S: "2025-09-01" }] },
  };
  const overrideWithWaitlist = {
    courseId: { S: "2" },
    date: { S: "2025-09-01" },
    participants: { L: [{ S: "Bob" }] },
    swapped: { L: [] },
    waitlist: { L: [{ S: "Alice" }] },
  };
  const overrideCleared = { ...overrideWithWaitlist, waitlist: { L: [] } };

  process.env.PARTICIPANTS_TABLE = "test-participants";
  ddbMock.on(GetItemCommand).resolves({
    Item: {
      tenantId: { S: "default-tenant" },
      userId: { S: "Alice" },
      settings: { M: { waitlistNoPromoteWithinMinutes: { N: "300" } } },
    },
  });
  ddbMock.on(DeleteItemCommand).resolves({});
  ddbMock.on(UpdateItemCommand).resolves({});
  ddbMock
    .on(QueryCommand)
    .resolvesOnce({ Items: [pendingSwap] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideWithWaitlist] })
    .resolvesOnce({ Items: [] })
    .resolvesOnce({ Items: [course] })
    .resolvesOnce({ Items: [overrideCleared] })
    .resolvesOnce({ Items: [] })
    .resolvesOnce({ Items: [overrideCleared] });

  const event = makeEvent({ currentUser: "Alice" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.promoted).toBe(0);
  expect(ddbMock.commandCalls(DeleteItemCommand).length).toBeGreaterThanOrEqual(1);
  expect(ddbMock.commandCalls(UpdateItemCommand).length).toBeGreaterThanOrEqual(1);

  delete process.env.PARTICIPANTS_TABLE;
});
