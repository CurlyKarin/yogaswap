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

describe("getSwaps Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SWAPS_TABLE: "test-swaps" };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const baseEvent = (params: Record<string, string | undefined>): APIGatewayProxyEvent =>
    ({
      queryStringParameters: params,
    } as any);

  test("returns 400 if user is missing", async () => {
    const event = baseEvent({});
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain("Missing user parameter");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("queries via GSI_From when fromDate and fromCourseId are provided", async () => {
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
      ],
    });

    const event = baseEvent({
      user: "Nia",
      fromDate: "2025-10-01",
      fromCourseId: "1",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body[0].user).toBe("Nia");

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-swaps",
        IndexName: "GSI_From",
        KeyConditionExpression: "#u = :u AND begins_with(#f, :f)",
        ExpressionAttributeNames: expect.objectContaining({
          "#u": "user",
          "#f": "fromDate_fromCourseId_status",
        }),
        ExpressionAttributeValues: expect.objectContaining({
          ":u": { S: "Nia" },
          ":f": { S: "2025-10-01_1" },
        }),
      })
    );
  });

  test("queries via GSI_To when toDate and toCourseId are provided", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = baseEvent({
      user: "Nia",
      toDate: "2025-10-05",
      toCourseId: "3",
    });

    await handler(event);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI_To",
        KeyConditionExpression: "#u = :u AND begins_with(#t, :t)",
        ExpressionAttributeNames: expect.objectContaining({
          "#u": "user",
          "#t": "toDate_toCourseId_status",
        }),
      })
    );
  });

  test("queries by user only (fallback)", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = baseEvent({
      user: "Nia",
    });

    await handler(event);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        KeyConditionExpression: "#u = :u",
        ExpressionAttributeNames: expect.objectContaining({
          "#u": "user",
        }),
      })
    );
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const event = baseEvent({
      user: "Nia",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Internal Server Error");
  });
});
