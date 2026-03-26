import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("getParticipants Lambda", () => {
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
      queryStringParameters: null,
      requestContext: {} as any,
      ...overrides,
    } as any);

  test("returns participant list with derived status", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "admin" },
        role: { S: "admin" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        name: { S: "Demo" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          inviteSentAt: { S: "2026-01-01T12:00:00.000Z" },
        },
        {
          tenantId: { S: "default-tenant" },
          userId: { S: "bob" },
          authUserId: { S: "cognito-sub-123" },
        },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, role: { S: "participant" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" }, role: { S: "instructor" } },
      ],
    });

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toEqual([
      expect.objectContaining({ userId: "alice", status: "invited", role: "participant" }),
      expect.objectContaining({ userId: "bob", status: "active", role: "instructor" }),
    ]);

    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-participants",
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: "default-tenant" } },
      }),
    );
  });

  test("filters by search over userId and email", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "admin" },
        role: { S: "admin" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        name: { S: "Demo" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, email: { S: "alice@example.com" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" }, email: { S: "bob@example.com" } },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, role: { S: "participant" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" }, role: { S: "admin" } },
      ],
    });

    const result = await handler(
      makeEvent({
        queryStringParameters: { search: "ali" },
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe("alice");
  });

  test("returns only participants that have a tenant membership", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "admin" },
        role: { S: "admin" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        name: { S: "Demo" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, email: { S: "alice@example.com" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "ghost" }, email: { S: "ghost@example.com" } },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, role: { S: "participant" } },
      ],
    });

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe("alice");
  });

  test("filters by status", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, userId: { S: "admin" }, role: { S: "admin" } },
    });
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "no-login" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "invited" }, inviteSentAt: { S: "2026-01-01T12:00:00.000Z" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "active" }, authUserId: { S: "sub-1" } },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "no-login" }, role: { S: "participant" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "invited" }, role: { S: "instructor" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "active" }, role: { S: "admin" } },
      ],
    });

    const result = await handler(
      makeEvent({
        queryStringParameters: { status: "invited" },
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual(expect.objectContaining({ userId: "invited", status: "invited" }));
  });

  test("filters by hasEmail=true", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, userId: { S: "admin" }, role: { S: "admin" } },
    });
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, email: { S: "alice@example.com" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" } },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, role: { S: "participant" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" }, role: { S: "participant" } },
      ],
    });

    const result = await handler(
      makeEvent({
        queryStringParameters: { hasEmail: "true" },
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe("alice");
  });

  test("sorts by nickname descending", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, userId: { S: "admin" }, role: { S: "admin" } },
    });
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "charlie" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" } },
      ],
    });
    mockSend.mockResolvedValueOnce({
      Items: [
        { tenantId: { S: "default-tenant" }, userId: { S: "alice" }, role: { S: "participant" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "charlie" }, role: { S: "participant" } },
        { tenantId: { S: "default-tenant" }, userId: { S: "bob" }, role: { S: "participant" } },
      ],
    });

    const result = await handler(
      makeEvent({
        queryStringParameters: { sortBy: "nickname", sortOrder: "desc" },
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.map((p: { userId: string }) => p.userId)).toEqual(["charlie", "bob", "alice"]);
  });

  test("returns 400 for invalid status filter", async () => {
    const result = await handler(
      makeEvent({
        queryStringParameters: { status: "unknown" },
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Invalid status filter/);
  });

  test("returns 500 when table env var is missing", async () => {
    process.env.PARTICIPANTS_TABLE = "";
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toMatch(/PARTICIPANTS_TABLE/);
  });

  test("returns 403 when membership is missing", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "intruder" } } as any,
      }),
    );
    expect(result.statusCode).toBe(403);
  });

  test("returns 403 for participant role", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "default-tenant" },
        userId: { S: "p1" },
        role: { S: "participant" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
    });
    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "p1" } } as any,
      }),
    );
    expect(result.statusCode).toBe(403);
  });
});

