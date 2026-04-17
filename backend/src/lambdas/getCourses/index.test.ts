import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    QueryCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("getCourses Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, COURSES_TABLE: "test-courses" };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
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
        status: "draft",
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
});
