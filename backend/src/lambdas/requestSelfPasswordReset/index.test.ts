import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    UpdateItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("@aws-sdk/client-ses", () => {
  const mockSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: mockSend })),
    SendEmailCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("crypto", () => ({
  randomBytes: jest.fn(() => Buffer.from("fixed-token-123")),
}));

const { mockSend: dynamoMockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const { mockSend: sesMockSend } = jest.requireMock("@aws-sdk/client-ses");

describe("requestSelfPasswordReset Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      AUTH_TOKENS_TABLE: "test-auth-tokens",
      BASE_URL: "https://app.yogaswap.de",
      SES_SOURCE_EMAIL: "support@yogaswap.de",
    };
    dynamoMockSend.mockReset();
    sesMockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: { "x-tenant-id": "default-tenant" },
      body: JSON.stringify({ nickname: "alice" }),
      ...overrides,
    } as any);

  test("returns generic success when participant is unknown", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({ Item: undefined }) // exact lower lookup
      .mockResolvedValueOnce({ Items: [] }); // normalized query

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });
    expect(sesMockSend).not.toHaveBeenCalled();
  });

  test("creates user-password-reset token and sends recovery mail", async () => {
    const nowMs = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowMs);

    dynamoMockSend
      .mockResolvedValueOnce({ Item: undefined }) // exact lower lookup
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            userId: { S: "Alice" },
            cognitoUsername: { S: "Alice" },
            email: { S: "alice@example.com" },
          },
        ],
      }) // normalized query
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "Alice" },
          role: { S: "participant" },
        },
      }) // membership exists
      .mockResolvedValueOnce({}) // participant nonce update
      .mockResolvedValueOnce({}); // put token
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-auth-tokens",
        Item: expect.objectContaining({
          purpose: { S: "user-password-reset" },
          userId: { S: "Alice" },
          cognitoUsername: { S: "Alice" },
          tokenNonce: expect.objectContaining({ S: expect.any(String) }),
        }),
      }),
    );
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ["alice@example.com"] },
      }),
    );
  });

  test("returns generic success when tenant membership is missing", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          cognitoUsername: { S: "alice" },
          email: { S: "alice@example.com" },
        },
      }) // exact lower lookup
      .mockResolvedValueOnce({ Item: undefined }); // membership missing

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });
    expect(sesMockSend).not.toHaveBeenCalled();
  });
});

