import { DeleteItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    DeleteItemCommand: jest.fn((input) => input),
    GetItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("deleteSwap Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      SWAPS_TABLE: "test-swaps",
      COURSES_TABLE: "test-courses",
    };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (swapId?: string, user?: string): APIGatewayProxyEvent =>
    ({
      pathParameters: swapId ? { swapId } : null,
      queryStringParameters: user ? { user } : null,
    } as APIGatewayProxyEvent);

  test("returns 400 if swapId or user is missing", async () => {
    const event = makeEvent(undefined, "Nia");
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing swapId or user parameter");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("returns 404 when swap does not exist", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("missing-swap", "Nia");
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe("Swap not found");
    expect(GetItemCommand).toHaveBeenCalled();
    expect(DeleteItemCommand).not.toHaveBeenCalled();
  });

  test("returns 403 when origin and target are both in the past", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          fromDate: { S: "2020-01-06" },
          toDate: { S: "2020-01-13" },
          fromCourseId: { S: "1" },
          toCourseId: { S: "2" },
        },
      })
      .mockResolvedValueOnce({ Item: { time: { S: "10:00" } } })
      .mockResolvedValueOnce({ Item: { time: { S: "10:00" } } });

    const event = makeEvent("2020-01-06_1_2020-01-13_2", "Nia");
    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toContain("Vergangenheit");
    expect(DeleteItemCommand).not.toHaveBeenCalled();
  });

  test("deletes an existing swap when target is still in the future", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          fromDate: { S: "2020-01-06" },
          toDate: { S: "2099-06-20" },
          fromCourseId: { S: "1" },
          toCourseId: { S: "2" },
        },
      })
      .mockResolvedValueOnce({ Item: { time: { S: "10:00" } } })
      .mockResolvedValueOnce({ Item: { time: { S: "10:00" } } })
      .mockResolvedValueOnce({});

    const event = makeEvent("2020-01-06_1_2099-06-20_2", "Nia");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Swap deleted successfully");
    expect(DeleteItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-swaps",
        Key: {
          tenantId: { S: "default-tenant" },
          user_swapId: { S: "Nia#2020-01-06_1_2099-06-20_2" },
        },
      }),
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
