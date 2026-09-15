import { handler } from "./index";
import { APIGatewayProxyEvent } from "aws-lambda";

jest.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const mockSend = jest.fn();
  return {
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
    ListUsersCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend: cognitoMockSend } = jest.requireMock(
  "@aws-sdk/client-cognito-identity-provider",
);
const { mockSend: dynamoMockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("listIdentityCandidates", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      USER_POOL_ID: "pool",
      MEMBERSHIPS_TABLE: "memberships",
      TENANTS_TABLE: "tenants",
      PARTICIPANTS_TABLE: "participants",
    };
    cognitoMockSend.mockReset();
    dynamoMockSend.mockReset();
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" } },
      })
      .mockResolvedValueOnce({ Items: [] }); // participants by cognitoUsername
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function event(query: Record<string, string>): APIGatewayProxyEvent {
    return {
      queryStringParameters: query,
      headers: { "x-tenant-id": "default-tenant" },
      requestContext: { authorizer: { principalId: "admin" } } as any,
    } as any;
  }

  test("returns candidates with nickname matches first (#342)", async () => {
    cognitoMockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: "opaque-other",
          UserStatus: "CONFIRMED",
          Attributes: [
            { Name: "sub", Value: "sub-other" },
            { Name: "email", Value: "a@example.com" },
            { Name: "nickname", Value: "other" },
          ],
        },
        {
          Username: "opaque-luna",
          UserStatus: "FORCE_CHANGE_PASSWORD",
          Attributes: [
            { Name: "sub", Value: "sub-luna" },
            { Name: "email", Value: "a@example.com" },
            { Name: "nickname", Value: "Luna" },
          ],
        },
      ],
    });

    const res = await handler(event({ email: "a@example.com", nickname: "luna" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0].cognitoUsername).toBe("opaque-luna");
    expect(body.candidates[0].nicknameMatch).toBe(true);
    expect(body.candidates[1].nicknameMatch).toBe(false);
  });

  test("marks current same-studio members as linkBlocked (#342)", async () => {
    dynamoMockSend.mockReset();
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" } },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            userId: { S: "mutter" },
            cognitoUsername: { S: "opaque-mutter" },
            authUserId: { S: "sub-mutter" },
            inviteCompletedAt: { S: "2026-01-01T00:00:00.000Z" },
          },
        ],
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "mutter" },
          role: { S: "participant" },
        },
      });

    cognitoMockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: "opaque-mutter",
          UserStatus: "CONFIRMED",
          Attributes: [
            { Name: "sub", Value: "sub-mutter" },
            { Name: "email", Value: "shared@example.com" },
            { Name: "nickname", Value: "mutter" },
          ],
        },
      ],
    });

    const res = await handler(event({ email: "shared@example.com", nickname: "tochter" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.candidates[0].tenantUserId).toBe("mutter");
    expect(body.candidates[0].tenantStatus).toBe("active");
    expect(body.candidates[0].linkBlocked).toBe(true);
  });

  test("marks invited same-studio members as linkBlocked (#342)", async () => {
    dynamoMockSend.mockReset();
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" } },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            userId: { S: "ida" },
            cognitoUsername: { S: "opaque-ida" },
            inviteSentAt: { S: "2026-03-01T00:00:00.000Z" },
          },
        ],
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "ida" },
          role: { S: "participant" },
        },
      });

    cognitoMockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: "opaque-ida",
          UserStatus: "FORCE_CHANGE_PASSWORD",
          Attributes: [
            { Name: "sub", Value: "sub-ida" },
            { Name: "email", Value: "ida@example.com" },
            { Name: "nickname", Value: "Ida" },
          ],
        },
      ],
    });

    const res = await handler(event({ email: "ida@example.com", nickname: "other" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.candidates[0].tenantUserId).toBe("ida");
    expect(body.candidates[0].tenantStatus).toBe("invited");
    expect(body.candidates[0].linkBlocked).toBe(true);
  });

  test("rejects missing email", async () => {
    const res = await handler(event({ nickname: "luna" }));
    expect(res.statusCode).toBe(400);
  });
});
