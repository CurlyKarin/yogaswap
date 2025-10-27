import { DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

// DynamoDB Mock Setup
jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    DeleteItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("deleteSwap Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SWAPS_TABLE: "test-swaps" };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (swapId?: string, user?: string): APIGatewayProxyEvent =>
    ({
      pathParameters: swapId ? { swapId } : null,
      queryStringParameters: user ? { user } : null,
    } as any);

  test("returns 400 if swapId or user is missing", async () => {
    const event = makeEvent(undefined, "Nia");
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing swapId or user parameter");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("deletes an existing swap successfully", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("abc123", "Nia");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Swap deleted successfully");

    expect(DeleteItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-swaps",
        Key: { swapId: { S: "abc123" }, user: { S: "Nia" } },
      })
    );
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const event = makeEvent("xyz789", "Luna");
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Internal Server Error");
  });
});
