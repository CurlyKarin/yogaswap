import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

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

describe("deleteParticipant Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      TENANTS_TABLE: "test-tenants",
      SES_SOURCE_EMAIL: "yogaswap@example.com",
    };
    mockSend.mockReset();
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

  test("deletes membership and profile for no-login participant without other memberships", async () => {
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
      }) // actor role check
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
        },
      }) // existing participant
      .mockResolvedValueOnce({}) // membership delete
      .mockResolvedValueOnce({ Count: 0, Items: [] }) // no remaining memberships
      .mockResolvedValueOnce({}); // participant delete
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
      notificationEmail: "alice@example.com",
      notificationEmailSent: true,
    });
    expect(sesMockSend).toHaveBeenCalledTimes(1);
  });

  test("deletes only membership when participant has authUserId", async () => {
    mockSend
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
          name: { S: "Demo" },
        },
      })
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
          authUserId: { S: "sub-123" },
          email: { S: "alice@example.com" },
        },
      })
      .mockResolvedValueOnce({});
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: false,
      notificationEmail: "alice@example.com",
      notificationEmailSent: true,
    });
    // No scan and no profile delete in this case.
    expect(mockSend).toHaveBeenCalledTimes(5);
    expect(sesMockSend).toHaveBeenCalledTimes(1);
  });

  test("deletes only membership when user still has membership in another tenant", async () => {
    mockSend
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
          name: { S: "Demo" },
        },
      })
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
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Count: 1,
        Items: [{ tenantId: { S: "other-tenant" }, userId: { S: "alice" } }],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).profileDeleted).toBe(false);
    expect(JSON.parse(result.body).notificationEmail).toBeUndefined();
    expect(JSON.parse(result.body).notificationEmailSent).toBe(false);
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

