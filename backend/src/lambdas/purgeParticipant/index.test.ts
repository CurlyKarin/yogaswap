import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";
import { invalidateAuthTokensForUser } from "../shared/invalidateAuthTokens";
import { deleteCognitoUserBestEffort } from "../shared/deleteIncompleteCognitoUser";
import { hasOtherStudioParticipantPresence } from "../shared/otherStudioPresence";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    DeleteItemCommand: jest.fn((input) => input),
    ScanCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

jest.mock("@aws-sdk/client-ses", () => {
  const sesMockSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: sesMockSend })),
    SendEmailCommand: jest.fn((input) => input),
    sesMockSend,
  };
});
const { sesMockSend } = jest.requireMock("@aws-sdk/client-ses");

jest.mock("../shared/invalidateAuthTokens", () => ({
  invalidateAuthTokensForUser: jest.fn().mockResolvedValue(0),
}));

jest.mock("../shared/deleteIncompleteCognitoUser", () => ({
  deleteCognitoUserBestEffort: jest.fn().mockResolvedValue(false),
}));

jest.mock("../shared/otherStudioPresence", () => ({
  hasOtherStudioParticipantPresence: jest.fn().mockResolvedValue(false),
}));

const mockedInvalidateTokens = invalidateAuthTokensForUser as jest.MockedFunction<
  typeof invalidateAuthTokensForUser
>;
const mockedDeleteCognito = deleteCognitoUserBestEffort as jest.MockedFunction<
  typeof deleteCognitoUserBestEffort
>;
const mockedOtherStudio = hasOtherStudioParticipantPresence as jest.MockedFunction<
  typeof hasOtherStudioParticipantPresence
>;

describe("purgeParticipant Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      TENANTS_TABLE: "test-tenants",
      AUTH_TOKENS_TABLE: "test-auth-tokens",
      USER_POOL_ID: "test-user-pool",
      SES_SOURCE_EMAIL: "yogaswap@example.com",
    };
    mockSend.mockReset();
    sesMockSend.mockReset();
    mockedInvalidateTokens.mockReset();
    mockedInvalidateTokens.mockResolvedValue(1);
    mockedDeleteCognito.mockReset();
    mockedDeleteCognito.mockResolvedValue(true);
    mockedOtherStudio.mockReset();
    mockedOtherStudio.mockResolvedValue(false);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: {},
      pathParameters: { userId: "alice" },
      requestContext: { authorizer: { principalId: "admin" } } as never,
      ...overrides,
    }) as APIGatewayProxyEvent;

  const authAndProfileMocks = (opts?: { stillMember?: boolean; noProfile?: boolean }) => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // membership for canManage
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      }) // tenant for canManage
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }); // actor role

    if (opts?.noProfile) {
      mockSend.mockResolvedValueOnce({}); // profile missing
      return;
    }

    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "alice" },
        email: { S: "alice@example.com" },
        authUserId: { S: "sub-alice" },
        cognitoUsername: { S: "opaque-alice" },
        displayName: { S: "Alice" },
      },
    });

    if (opts?.stillMember) {
      mockSend.mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          role: { S: "participant" },
        },
      });
      return;
    }

    mockSend.mockResolvedValueOnce({}); // no membership → orphaned
    mockSend.mockResolvedValueOnce({}); // DeleteItem profile
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
    }); // loadTenantName for mail
  };

  it("rejects non-admin", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "trainer" },
          role: { S: "instructor" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "trainer" },
          role: { S: "instructor" },
        },
      });

    const res = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "trainer" } } as never,
      }),
    );
    expect(res.statusCode).toBe(403);
    expect(mockedDeleteCognito).not.toHaveBeenCalled();
  });

  it("returns 409 when target still has membership", async () => {
    authAndProfileMocks({ stillMember: true });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe("still_active_member");
    expect(mockedDeleteCognito).not.toHaveBeenCalled();
  });

  it("returns 404 when profile missing", async () => {
    authAndProfileMocks({ noProfile: true });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  it("deletes profile + Cognito when no other studio presence", async () => {
    authAndProfileMocks();
    mockedOtherStudio.mockResolvedValue(false);
    mockedDeleteCognito.mockResolvedValue(true);
    sesMockSend.mockResolvedValue({});

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.profileDeleted).toBe(true);
    expect(body.cognitoUserDeleted).toBe(true);
    expect(body.purgeScope).toBe("full_account");
    expect(body.otherStudioPresence).toBe(false);
    expect(mockedDeleteCognito).toHaveBeenCalledWith(
      expect.objectContaining({
        userPoolId: "test-user-pool",
        cognitoUsername: "opaque-alice",
        userId: "alice",
      }),
    );
    expect(sesMockSend).toHaveBeenCalled();
    expect(mockedInvalidateTokens).toHaveBeenCalled();
  });

  it("deletes only local profile when other studio presence", async () => {
    authAndProfileMocks();
    mockedOtherStudio.mockResolvedValue(true);
    sesMockSend.mockResolvedValue({});

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.profileDeleted).toBe(true);
    expect(body.cognitoUserDeleted).toBe(false);
    expect(body.purgeScope).toBe("studio_only");
    expect(body.otherStudioPresence).toBe(true);
    expect(mockedDeleteCognito).not.toHaveBeenCalled();
    expect(sesMockSend).toHaveBeenCalled();
  });
});
