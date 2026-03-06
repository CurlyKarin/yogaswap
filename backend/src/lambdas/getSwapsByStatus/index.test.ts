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

describe("getSwapsByStatus Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SWAPS_TABLE: "test-swaps" };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (status?: string): APIGatewayProxyEvent =>
    ({
      queryStringParameters: status ? { status } : null,
    } as any);

  test("returns 400 if status is missing", async () => {
    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing status parameter");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("returns swaps with given status", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user: { S: "Nia" },
          fromCourseId: { S: "1" },
          fromDate: { S: "2025-10-01" },
          toCourseId: { S: "2" },
          toDate: { S: "2025-10-02" },
          status: { S: "pending" },
        },
        {
          user: { S: "Kai" },
          fromCourseId: { S: "2" },
          fromDate: { S: "2025-10-03" },
          toCourseId: { S: "3" },
          toDate: { S: "2025-10-04" },
          status: { S: "pending" },
        },
      ],
    });

    const event = makeEvent("pending");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    expect(body[0].status).toBe("pending");
    expect(body[1].status).toBe("pending");

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-swaps",
        KeyConditionExpression: "tenantId = :tid",
        FilterExpression: "#s = :s",
        ExpressionAttributeValues: expect.objectContaining({
          ":tid": { S: "default-tenant" },
          ":s": { S: "pending" },
        }),
        ConsistentRead: true,
      })
    );
  });

  test("returns empty array if no swaps match", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = makeEvent("confirmed");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const event = makeEvent("pending");
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Internal Server Error");
  });
});
