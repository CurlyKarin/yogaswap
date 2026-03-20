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

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "admin" } } as any,
      }),
    );
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body).toEqual([
      expect.objectContaining({ userId: "alice", status: "invited" }),
      expect.objectContaining({ userId: "bob", status: "active" }),
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

