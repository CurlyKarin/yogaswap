import { handler } from "./index";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const ddbMock = mockClient(DynamoDBClient);

// Hilfsfunktion zum Erstellen eines Events
const makeEvent = (body?: any) => ({
  body: body ? JSON.stringify(body) : undefined,
} as any);

beforeEach(() => {
  ddbMock.reset();
  process.env.SWAPS_TABLE = "test-swaps";
  process.env.COURSES_TABLE = "test-courses";
  process.env.OVERRIDES_TABLE = "test-overrides";
});

test("returns 400 if request body is missing", async () => {
  const event = makeEvent();
  const result = await handler(event);
  expect(result.statusCode).toBe(400);
  const body = JSON.parse(result.body);
  expect(body.error).toContain("Missing request body");
});

test("returns 500 if DynamoDB scan throws", async () => {
  ddbMock.on(ScanCommand).rejects(new Error("DynamoDB error"));

  const event = makeEvent({ currentUser: "testuser" });
  const result = await handler(event);
  expect(result.statusCode).toBe(500);
  const body = JSON.parse(result.body);
  expect(body.error).toBe("Failed to process promotions");
});

test("returns 200 if all scans return empty lists", async () => {
  // Drei Scans werden aufgerufen: SWAPS, COURSES, OVERRIDES
  ddbMock.on(ScanCommand).resolves({ Items: [] });

  const event = makeEvent({ currentUser: "testuser" });
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  const body = JSON.parse(result.body);
  expect(body.message).toBe("Promotions processed");
  expect(body.promoted).toBe(0);
  expect(Array.isArray(body.swaps)).toBe(true);
  expect(Array.isArray(body.overrides)).toBe(true);
});
