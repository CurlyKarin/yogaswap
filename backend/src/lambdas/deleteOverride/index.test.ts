import { handler } from "./index";
import { DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";

// DynamoDB Mock Setup
jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    DeleteItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("deleteOverride Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, OVERRIDES_TABLE: "test-overrides", COURSES_TABLE: "test-courses" };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (courseId?: string, date?: string): APIGatewayProxyEvent =>
    ({
      pathParameters: courseId && date ? { courseId, date } : null,
    } as any);

  test("returns 400 if courseId or date are missing", async () => {
    const event = makeEvent(undefined, undefined);
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing courseId or date");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("deletes an override successfully", async () => {
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("course-123", "2025-10-01");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Override deleted");

    expect(DeleteItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-overrides",
        Key: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "course-123_2025-10-01" },
        },
      })
    );
  });

  test("returns 500 on DynamoDB error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const event = makeEvent("course-123", "2025-10-01");
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe("Failed to delete override");
  });
});
