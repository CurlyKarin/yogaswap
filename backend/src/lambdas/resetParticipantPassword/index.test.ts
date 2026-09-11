import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("@aws-sdk/client-cognito-identity-provider", () => {
  return {};
});

jest.mock("@aws-sdk/client-ses", () => {
  const mockSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: mockSend })),
    SendEmailCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend: dynamoMockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const { mockSend: sesMockSend } = jest.requireMock("@aws-sdk/client-ses");

describe("resetParticipantPassword Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      USER_POOL_ID: "test-user-pool-id",
      BASE_URL: "https://yogaswap.example.com",
      SES_SOURCE_EMAIL: "support@yogaswap.de",
      AUTH_TOKENS_TABLE: "test-auth-tokens",
    };
    dynamoMockSend.mockReset();
    sesMockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: {},
      pathParameters: { userId: "alice" },
      requestContext: { authorizer: { principalId: "admin" } } as any,
      ...overrides,
    } as any);

  test("returns 403 for non-admin actor", async () => {
    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "instructor-1" },
        role: { S: "instructor" },
      },
    });

    const result = await handler(
      makeEvent({ requestContext: { authorizer: { principalId: "instructor-1" } } as any }),
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toMatch(/Only admins can reset passwords/);
  });

  test("returns 404 when participant does not exist", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe("Participant not found");
  });

  test("resets password and sends reset email", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          cognitoUsername: { S: "Alice" },
        },
      })
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(body.userId).toBe("alice");
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ["alice@example.com"] },
      }),
    );
  });

  test("stores opaque cognitoUsername on token and login nickname in link (#324)", async () => {
    const opaque = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          cognitoUsername: { S: opaque },
        },
      })
      .mockResolvedValue({});
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-auth-tokens",
        Item: expect.objectContaining({
          cognitoUsername: { S: opaque },
          userId: { S: "alice" },
          purpose: { S: "admin-password-reset" },
        }),
      }),
    );

    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Message: expect.objectContaining({
          Body: expect.objectContaining({
            Html: expect.objectContaining({
              Data: expect.stringMatching(/nickname=alice/),
            }),
          }),
        }),
      }),
    );
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Message: expect.objectContaining({
          Body: expect.objectContaining({
            Html: expect.objectContaining({
              Data: expect.not.stringMatching(new RegExp(`nickname=${opaque}`)),
            }),
          }),
        }),
      }),
    );
  });
});

