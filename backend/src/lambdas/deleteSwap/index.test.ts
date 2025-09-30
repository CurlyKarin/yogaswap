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

  const makeEvent = (swapId?: string): APIGatewayProxyEvent =>
    ({
      pathParameters: swapId ? { swapId } : null,
    } as any);

  test("returns 400 if swapId is missing", async () => {
    const event = makeEvent(undefined);
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing swapId");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("deletes an existing swap", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("abc123");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Swap deleted");

    expect(DeleteItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-swaps",
        Key: { swapId: { S: "abc123" } },
      })
    );
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const event = makeEvent("xyz789");
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Failed to delete swap");
  });
});
