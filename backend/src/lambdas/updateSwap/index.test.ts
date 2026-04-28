// src/lambdas/updateSwap/index.test.ts
import { handler } from "./index";
import { APIGatewayProxyEvent } from "aws-lambda";

// DynamoDB mocks
jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    UpdateItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("updateSwap Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SWAPS_TABLE: "test-swaps" };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  // minimal, aber vollständiger APIGatewayProxyEvent-Stub
  const makeEvent = (swapId?: string, user?: string, body?: any): APIGatewayProxyEvent =>
    ({
      pathParameters: swapId ? { swapId } : null,
      queryStringParameters: user ? { user } : null,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: {},
      multiValueHeaders: {},
      httpMethod: "PUT",
      isBase64Encoded: false,
      path: "/swaps/update",
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: "",
      requestContext: {} as any,
    } as APIGatewayProxyEvent);

  test("returns 400 if swapId or user is missing", async () => {
    const event = makeEvent(undefined, undefined, { status: "approved" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing swapId or user");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("returns 400 if body is missing", async () => {
    const event = makeEvent("2025-10-01_1_2025-10-02_2", "alice");
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing request body");
  });

  test("returns 400 if body is invalid JSON", async () => {
    const event = makeEvent("2025-10-01_1_2025-10-02_2", "bob", undefined);
    // setze absichtlich ungültiges JSON — cast to any um TypeScript zu umgehen
    (event as any).body = "{ invalid json }";
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Invalid JSON body");
  });

  test("returns 400 if status is missing", async () => {
    const event = makeEvent("2025-10-01_1_2025-10-02_2", "bob", {});
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing status field");
  });

  test("returns 400 if swapId format is invalid", async () => {
    const event = makeEvent("invalidSwapId", "bob", { status: "approved" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Invalid swapId format");
  });

  test("successfully updates a swap", async () => {
    mockSend.mockResolvedValueOnce({});
    const event = makeEvent("2025-10-01_1_2025-10-02_2", "luna", { status: "approved" });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: "Swap updated" });
    expect(mockSend).toHaveBeenCalledTimes(1);

    // mockSend wurde so gemockt, dass der erste Aufruf das command-input ist
    const sentArg = mockSend.mock.calls[0][0];
    // das Mock-Setup (jest.mock) gibt das UpdateItemCommand-Input zurück, also sind die Felder dort
    expect(sentArg.TableName).toBe("test-swaps");
    expect(sentArg.Key).toEqual({
      tenantId: { S: "default-tenant" },
      user_swapId: { S: "luna#2025-10-01_1_2025-10-02_2" },
    });
    expect(sentArg.ExpressionAttributeValues).toMatchObject({
      ":status": { S: "approved" },
      ":fromStatus": { S: "2025-10-01_1_approved" },
      ":toStatus": { S: "2025-10-02_2_approved" },
      ":actorUserId": { S: "luna" },
      ":actingForUserId": { NULL: true },
    });
    expect(sentArg.ExpressionAttributeNames).toMatchObject({
      "#actorUserId": "actorUserId",
      "#actingForUserId": "actingForUserId",
    });
  });

  test("returns 500 if DynamoDB update fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB failure"));
    const event = makeEvent("2025-10-01_1_2025-10-02_2", "luna", { status: "rejected" });

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    // Lambda liefert "Internal Server Error" als body
    expect(JSON.parse(result.body).error).toBe("Internal Server Error");
    expect(mockSend).toHaveBeenCalled();
  });
});
