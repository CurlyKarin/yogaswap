import { handler } from "./index";
import { DynamoDBClient, QueryCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const ddbMock = mockClient(DynamoDBClient);

const makeEvent = (body?: any) => ({
  body: body ? JSON.stringify(body) : undefined,
} as any);

const courseItems = [
  {
    courseId: { S: "1" },
    name: { S: "A" },
    weekday: { S: "Mon" },
    time: { S: "10:00" },
    capacity: { N: "2" },
    participants: { L: [{ S: "Alice" }] },
    dates: { L: [{ S: "2099-06-01" }] },
  },
  {
    courseId: { S: "2" },
    name: { S: "B" },
    weekday: { S: "Tue" },
    time: { S: "10:00" },
    capacity: { N: "2" },
    participants: { L: [{ S: "Bob" }] },
    dates: { L: [{ S: "2099-06-02" }] },
  },
];

const pendingSwapItems = [
  {
    user: { S: "Alice" },
    fromCourseId: { N: "1" },
    fromDate: { S: "2099-06-01" },
    toCourseId: { N: "2" },
    toDate: { S: "2099-06-02" },
    status: { S: "pending" },
  },
  {
    user: { S: "Bob" },
    fromCourseId: { N: "2" },
    fromDate: { S: "2099-06-02" },
    toCourseId: { N: "1" },
    toDate: { S: "2099-06-01" },
    status: { S: "pending" },
  },
];

beforeEach(() => {
  ddbMock.reset();
  process.env.SWAPS_TABLE = "test-swaps";
  process.env.OVERRIDES_TABLE = "test-overrides";
  process.env.COURSES_TABLE = "test-courses";
});

test("returns 400 if request body is missing", async () => {
  const result = await handler(makeEvent());
  expect(result.statusCode).toBe(400);
});

test("executes selected ring cycle transactionally", async () => {
  ddbMock
    .on(QueryCommand)
    .callsFake((input) => {
      if (input.TableName === "test-swaps") {
        return { Items: pendingSwapItems };
      }
      if (input.TableName === "test-courses") {
        return { Items: courseItems };
      }
      if (input.TableName === "test-overrides") {
        return { Items: [] };
      }
      return { Items: [] };
    })
    .on(TransactWriteItemsCommand)
    .resolves({});

  const result = await handler(makeEvent({ trigger: "test" }));
  expect(result.statusCode).toBe(200);

  const body = JSON.parse(result.body);
  expect(body.message).toBe("Ring swaps executed");
  expect(body.diagnostics.pendingSwaps).toBe(2);
  expect(body.diagnostics.detectedCycles).toBe(1);
  expect(body.diagnostics.executedCycles).toBe(1);
  expect(ddbMock.commandCalls(TransactWriteItemsCommand)).toHaveLength(1);
});

test("returns analysis only when no cycles are executable", async () => {
  ddbMock
    .on(QueryCommand)
    .callsFake((input) => {
      if (input.TableName === "test-swaps") {
        return { Items: [pendingSwapItems[0]] };
      }
      if (input.TableName === "test-courses") {
        return { Items: courseItems };
      }
      return { Items: [] };
    });

  const result = await handler(makeEvent({ trigger: "test" }));
  expect(result.statusCode).toBe(200);

  const body = JSON.parse(result.body);
  expect(body.diagnostics.detectedCycles).toBe(0);
  expect(body.diagnostics.executedCycles).toBe(0);
  expect(ddbMock.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
});

test("returns 500 when query fails", async () => {
  ddbMock.on(QueryCommand).rejects(new Error("boom"));
  const result = await handler(makeEvent({ trigger: "test" }));
  expect(result.statusCode).toBe(500);
});
