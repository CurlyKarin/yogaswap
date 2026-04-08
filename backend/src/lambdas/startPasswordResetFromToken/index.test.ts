import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    UpdateItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const mockSend = jest.fn();
  return {
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
    AdminResetUserPasswordCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend: dynamoMockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const { mockSend: cognitoMockSend } = jest.requireMock("@aws-sdk/client-cognito-identity-provider");

describe("startPasswordResetFromToken Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      AUTH_TOKENS_TABLE: "test-auth-tokens",
      USER_POOL_ID: "test-user-pool-id",
    };

    dynamoMockSend.mockReset();
    cognitoMockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: {},
      queryStringParameters: { token: "t1", tenantId: "tenant-1" },
      ...overrides,
    } as any);

  test("returns 200 and triggers AdminResetUserPassword for valid unused token", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem

    dynamoMockSend.mockResolvedValueOnce({}); // UpdateItem
    cognitoMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).username).toBe("Alice");
    expect(cognitoMockSend).toHaveBeenCalledTimes(1);
  });

  test("returns 400 for expired token", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) - 1) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Token expired/i);
  });

  test("returns 400 for already used token", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        usedAt: { N: "1" },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Token already used/i);
  });

  test("returns 404 for unknown token", async () => {
    dynamoMockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe("Token not found");
  });

  test("returns 400 when token is concurrently used/expired (ConditionalCheckFailed)", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem

    const condErr = new Error("ConditionalCheckFailed");
    (condErr as any).name = "ConditionalCheckFailedException";
    dynamoMockSend.mockRejectedValueOnce(condErr); // UpdateItem

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/already used or expired/i);
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test("returns 400 for InvalidParameterException from Cognito", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem
    dynamoMockSend.mockResolvedValueOnce({}); // UpdateItem

    const invalidParamError = new Error("Cannot deliver code");
    (invalidParamError as any).name = "InvalidParameterException";
    cognitoMockSend.mockRejectedValueOnce(invalidParamError);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/cannot be delivered/i);
  });

  test("returns 400 for NotAuthorizedException from Cognito", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem
    dynamoMockSend.mockResolvedValueOnce({}); // UpdateItem

    const notAuthorized = new Error("User password cannot be reset in the current state.");
    (notAuthorized as any).name = "NotAuthorizedException";
    cognitoMockSend.mockRejectedValueOnce(notAuthorized);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/not allowed for this account state/i);
  });

  test("returns 400 for CodeDeliveryFailureException from Cognito", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem
    dynamoMockSend.mockResolvedValueOnce({}); // UpdateItem

    const deliveryError = new Error("Code delivery failed");
    (deliveryError as any).name = "CodeDeliveryFailureException";
    cognitoMockSend.mockRejectedValueOnce(deliveryError);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/could not be delivered/i);
  });

  test("returns 429 for TooManyRequestsException from Cognito", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "invite-activation" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    }); // GetItem
    dynamoMockSend.mockResolvedValueOnce({}); // UpdateItem

    const throttled = new Error("Too many requests");
    (throttled as any).name = "TooManyRequestsException";
    cognitoMockSend.mockRejectedValueOnce(throttled);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(429);
    expect(JSON.parse(result.body).error).toMatch(/too many reset attempts/i);
  });

  test("returns 400 for token with unsupported purpose", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "tenant-1" },
        token: { S: "t1" },
        purpose: { S: "user-password-reset" },
        expiresAt: { N: String(Math.floor(nowMs / 1000) + 3600) },
        cognitoUsername: { S: "Alice" },
      },
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/purpose is invalid/i);
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });
});

