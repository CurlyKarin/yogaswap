import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";
import { collectStudioExitBlockers } from "../shared/studioExitBlockers";
import { invalidateAuthTokensForUser } from "../shared/invalidateAuthTokens";
import { deleteCognitoUserBestEffort } from "../shared/deleteIncompleteCognitoUser";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    DeleteItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
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

jest.mock("../shared/studioExitBlockers", () => {
  const actual = jest.requireActual("../shared/studioExitBlockers");
  return {
    ...actual,
    collectStudioExitBlockers: jest.fn(),
  };
});

jest.mock("../shared/invalidateAuthTokens", () => ({
  invalidateAuthTokensForUser: jest.fn().mockResolvedValue(0),
}));

jest.mock("../shared/deleteIncompleteCognitoUser", () => ({
  deleteCognitoUserBestEffort: jest.fn().mockResolvedValue(false),
}));

const mockedCollectBlockers = collectStudioExitBlockers as jest.MockedFunction<
  typeof collectStudioExitBlockers
>;
const mockedInvalidateTokens = invalidateAuthTokensForUser as jest.MockedFunction<
  typeof invalidateAuthTokensForUser
>;
const mockedDeleteCognito = deleteCognitoUserBestEffort as jest.MockedFunction<
  typeof deleteCognitoUserBestEffort
>;

const emptyBlockers = {
  asOf: "2026-09-18",
  courses: [] as [],
  swaps: [] as [],
  waitlist: [] as [],
};

describe("deleteParticipant Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      TENANTS_TABLE: "test-tenants",
      COURSES_TABLE: "test-courses",
      COURSE_ENROLLMENTS_TABLE: "test-enrollments",
      SWAPS_TABLE: "test-swaps",
      OVERRIDES_TABLE: "test-overrides",
      AUTH_TOKENS_TABLE: "test-auth-tokens",
      USER_POOL_ID: "test-user-pool",
      SES_SOURCE_EMAIL: "yogaswap@example.com",
    };
    mockSend.mockReset();
    sesMockSend.mockReset();
    mockedCollectBlockers.mockReset();
    mockedCollectBlockers.mockResolvedValue(emptyBlockers);
    mockedInvalidateTokens.mockReset();
    mockedInvalidateTokens.mockResolvedValue(0);
    mockedDeleteCognito.mockReset();
    mockedDeleteCognito.mockResolvedValue(false);
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

  const authMocks = () =>
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // membership auth check
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      }) // tenant auth check
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }); // actor role check

  test("deletes membership and profile for no-login participant without sending notification mail", async () => {
    authMocks()
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
        },
      }) // existing participant
      .mockResolvedValueOnce({}) // membership delete
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            courseId: { S: "course-a" },
            participants: { L: [{ S: "alice" }, { S: "bob" }] },
          },
        ],
      }) // courses query
      .mockResolvedValueOnce({}) // update course participants
      .mockResolvedValueOnce({ Count: 0, Items: [] }) // no remaining memberships
      .mockResolvedValueOnce({}); // participant delete
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
      notificationEmailAttempted: false,
      notificationEmailSent: false,
      authTokensInvalidated: 0,
      cognitoUserDeleted: false,
    });
    expect(sesMockSend).not.toHaveBeenCalled();
    expect(mockedInvalidateTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        authTokensTable: "test-auth-tokens",
        tenantId: "default-tenant",
        userId: "alice",
      }),
    );
    expect(mockedDeleteCognito).not.toHaveBeenCalled();
  });

  test("returns 409 when studio exit is blocked by future enrollment", async () => {
    authMocks().mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "alice" },
      },
    });
    mockedCollectBlockers.mockResolvedValueOnce({
      asOf: "2026-09-18",
      courses: [{ courseId: 1, courseName: "Yoga", reason: "enrollment" }],
      swaps: [],
      waitlist: [],
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.code).toBe("studio_exit_blocked");
    expect(body.courses).toEqual([
      { courseId: 1, courseName: "Yoga", reason: "enrollment" },
    ]);
    expect(sesMockSend).not.toHaveBeenCalled();
  });

  test("check=1 returns blockers without deleting", async () => {
    authMocks().mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "alice" },
      },
    });
    mockedCollectBlockers.mockResolvedValueOnce({
      asOf: "2026-09-18",
      courses: [],
      swaps: [
        {
          fromDate: "2026-09-20",
          fromCourseId: 1,
          toDate: "2026-09-22",
          toCourseId: 2,
          status: "pending",
        },
      ],
      waitlist: [],
    });

    const result = await handler(
      makeEvent({ queryStringParameters: { check: "1" } }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.blocked).toBe(true);
    expect(body.swaps).toHaveLength(1);
    const { DeleteItemCommand } = jest.requireMock("@aws-sdk/client-dynamodb");
    expect(DeleteItemCommand).not.toHaveBeenCalled();
  });

  test("deletes only membership when participant has authUserId", async () => {
    authMocks()
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          participantId: { S: "31903206-7ce6-4886-9b95-2030705ca6ba" },
          displayName: { S: "Alice Example" },
          authUserId: { S: "sub-123" },
          email: { S: "alice@example.com" },
        },
      })
      .mockResolvedValueOnce({}) // membership delete
      .mockResolvedValueOnce({ Items: [] }) // courses query
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      }); // studio name for access-removed mail
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: false,
      notificationEmail: "alice@example.com",
      notificationEmailAttempted: true,
      notificationEmailSent: true,
      authTokensInvalidated: 0,
      cognitoUserDeleted: false,
    });
    expect(sesMockSend).toHaveBeenCalledTimes(1);
    const mailArg = sesMockSend.mock.calls[0][0];
    const html = mailArg?.Message?.Body?.Html?.Data || "";
    expect(html).toContain("Hallo Alice Example!");
    expect(html).toContain("Login-Namen <strong>alice</strong>");
    expect(html).toContain("Zugang fuer <strong>Demo</strong> entfernt");
    expect(html).not.toContain("Einladung");
    expect(html).not.toContain("31903206-7ce6-4886-9b95-2030705ca6ba");
  });

  test("invited-only delete sends invite-withdrawn mail and reports token invalidation", async () => {
    mockedInvalidateTokens.mockResolvedValueOnce(2);
    mockedDeleteCognito.mockResolvedValueOnce(true);
    authMocks()
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          displayName: { S: "Alice Example" },
          email: { S: "alice@example.com" },
          inviteSentAt: { S: "2026-09-01T12:00:00.000Z" },
          cognitoUsername: { S: "opaque-alice" },
        },
      })
      .mockResolvedValueOnce({}) // membership delete
      .mockResolvedValueOnce({ Items: [] }) // courses query
      .mockResolvedValueOnce({ Count: 0, Items: [] }) // no remaining memberships
      .mockResolvedValueOnce({}) // participant delete
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      }); // studio name
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
      notificationEmail: "alice@example.com",
      notificationEmailAttempted: true,
      notificationEmailSent: true,
      authTokensInvalidated: 2,
      cognitoUserDeleted: true,
    });
    expect(mockedInvalidateTokens).toHaveBeenCalled();
    expect(mockedDeleteCognito).toHaveBeenCalledWith(
      expect.objectContaining({
        userPoolId: "test-user-pool",
        cognitoUsername: "opaque-alice",
        userId: "alice",
      }),
    );
    const mailArg = sesMockSend.mock.calls[0][0];
    const html = mailArg?.Message?.Body?.Html?.Data || "";
    expect(mailArg?.Message?.Subject?.Data).toContain("Einladung zurueckgezogen");
    expect(html).toContain("Einladung zu YogaSwap");
    expect(html).toContain("zurueckgezogen");
  });

  test("deletes only membership when user still has membership in another tenant", async () => {
    authMocks()
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
        },
      })
      .mockResolvedValueOnce({}) // membership delete
      .mockResolvedValueOnce({ Items: [] }) // courses query
      .mockResolvedValueOnce({
        Count: 1,
        Items: [{ tenantId: { S: "other-tenant" }, userId: { S: "alice" } }],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).profileDeleted).toBe(false);
    expect(JSON.parse(result.body).notificationEmail).toBeUndefined();
    expect(JSON.parse(result.body).notificationEmailAttempted).toBe(false);
    expect(JSON.parse(result.body).notificationEmailSent).toBe(false);
    expect(JSON.parse(result.body).authTokensInvalidated).toBe(0);
    expect(JSON.parse(result.body).cognitoUserDeleted).toBe(false);
  });

  test("returns 403 when actor cannot manage participants", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
  });

  test("returns 403 when actor is instructor (not admin)", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }); // explicit role check

    const result = await handler(
      makeEvent({ requestContext: { authorizer: { principalId: "instructor-1" } } as any }),
    );
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toMatch(/Only admins can delete participants/);
  });
});
