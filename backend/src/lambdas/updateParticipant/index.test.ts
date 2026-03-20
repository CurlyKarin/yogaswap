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

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("updateParticipant Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      TENANTS_TABLE: "test-tenants",
    };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: {},
      pathParameters: { userId: "alice" },
      body: JSON.stringify({ email: "alice+new@example.com" }),
      requestContext: { authorizer: { principalId: "admin" } } as any,
      ...overrides,
    } as any);

  test("updates participant profile successfully", async () => {
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
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.email).toBe("alice+new@example.com");
    expect(body.userId).toBe("alice");
    expect(body.status).toBe("no_login");
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  test("returns 404 if participant does not exist", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({ Item: undefined });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe("Participant not found");
  });

  test("returns 400 for invalid settings payload", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
        },
      });

    const result = await handler(
      makeEvent({
        body: JSON.stringify({ settings: "not-an-object" }),
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/settings must be an object/);
  });

  test("derives invited/active status when inviteSentAt/authUserId are set", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
        },
      })
      .mockResolvedValueOnce({});

    const resultInvited = await handler(
      makeEvent({
        body: JSON.stringify({ inviteSentAt: "2026-01-01T12:00:00.000Z" }),
      }),
    );

    expect(resultInvited.statusCode).toBe(200);
    expect(JSON.parse(resultInvited.body).status).toBe("invited");

    mockSend.mockReset();
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          inviteSentAt: { S: "2026-01-01T12:00:00.000Z" },
        },
      })
      .mockResolvedValueOnce({});

    const resultActive = await handler(
      makeEvent({
        body: JSON.stringify({ authUserId: "cognito-sub-123" }),
      }),
    );

    expect(resultActive.statusCode).toBe(200);
    expect(JSON.parse(resultActive.body).status).toBe("active");
  });

  test("returns 403 when membership is missing", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
  });

  test("returns 403 when instructor is disabled by tenant setting", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          settings: {
            M: {
              instructorCanManageParticipants: { BOOL: false },
            },
          },
        },
      });

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "instructor-1" } } as any,
      }),
    );
    expect(result.statusCode).toBe(403);
  });
});

