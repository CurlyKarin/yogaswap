import { handler } from "./index";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const ddbMock = mockClient(DynamoDBClient);

const makeEvent = (body?: any) => ({
  body: body ? JSON.stringify(body) : undefined,
} as any);

beforeEach(() => {
  ddbMock.reset();
  process.env.SWAPS_TABLE = "test-swaps";
});

test("returns 400 if request body is missing", async () => {
  const result = await handler(makeEvent());
  expect(result.statusCode).toBe(400);
});

test("returns diagnostics for pending swaps graph", async () => {
  ddbMock
    .on(QueryCommand)
    .resolves({
      Items: [
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
      ],
    });

  const result = await handler(makeEvent({ trigger: "test" }));
  expect(result.statusCode).toBe(200);

  const body = JSON.parse(result.body);
  expect(body.message).toBe("Ring swap analysis complete");
  expect(body.diagnostics.pendingSwaps).toBe(2);
  expect(body.diagnostics.detectedCycles).toBe(1);
  expect(body.diagnostics.selectedCycles).toBe(1);
});

test("returns 500 when query fails", async () => {
  ddbMock.on(QueryCommand).rejects(new Error("boom"));
  const result = await handler(makeEvent({ trigger: "test" }));
  expect(result.statusCode).toBe(500);
});

