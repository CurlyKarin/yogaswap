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
      });
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

  test("rejects missing email", async () => {
    const res = await handler(event({ nickname: "luna" }));
    expect(res.statusCode).toBe(400);
  });
});
