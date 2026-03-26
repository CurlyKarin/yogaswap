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

describe("deleteParticipant Lambda", () => {
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
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
        },
      }) // existing participant
      .mockResolvedValueOnce({}) // membership delete
      .mockResolvedValueOnce({ Count: 0, Items: [] }) // no remaining memberships
      .mockResolvedValueOnce({}); // participant delete

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
    });
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
          userId: { S: "alice" },
          authUserId: { S: "sub-123" },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: false,
    });
    // No scan and no profile delete in this case.
    expect(mockSend).toHaveBeenCalledTimes(4);
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
  });

  test("returns 403 when actor cannot manage participants", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
  });
});

