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
      participantId: "Nia",
      fromDate: "2025-10-01",
      fromCourseId: "1",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body[0].participantId).toBe("Nia");

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-swaps",
        IndexName: "GSI_From",
        KeyConditionExpression: "tenantId_user = :tu AND begins_with(fromDate_fromCourseId_status, :f)",
        ExpressionAttributeValues: expect.objectContaining({
          ":tu": { S: "default-tenant#Nia" },
          ":f": { S: "2025-10-01_1" },
        }),
      })
    );
  });

  test("queries via GSI_To when toDate and toCourseId are provided", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = baseEvent({
      participantId: "Nia",
      toDate: "2025-10-05",
      toCourseId: "3",
    });

    await handler(event);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI_To",
        KeyConditionExpression: "tenantId_user = :tu AND begins_with(toDate_toCourseId_status, :t)",
        ExpressionAttributeValues: expect.objectContaining({
          ":tu": { S: "default-tenant#Nia" },
          ":t": { S: "2025-10-05_3" },
        }),
      })
    );
  });

  test("queries by user only (fallback)", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = baseEvent({
      participantId: "Nia",
    });

    await handler(event);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        KeyConditionExpression: "tenantId = :tid AND begins_with(user_swapId, :uprefix)",
        ExpressionAttributeValues: expect.objectContaining({
          ":tid": { S: "default-tenant" },
          ":uprefix": { S: "Nia#" },
        }),
      })
    );
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const event = baseEvent({
      participantId: "Nia",
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Internal Server Error");
  });
});
