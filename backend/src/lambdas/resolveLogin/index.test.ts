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

const { mockSend: dynamoMockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("resolveLogin Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
    };
    dynamoMockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: { "x-tenant-id": "studio-a" },
      body: JSON.stringify({ nickname: "alice" }),
      ...overrides,
    }) as any;

  test("returns 400 if nickname missing", async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Missing nickname");
  });

  test("returns generic 404 when participant unknown (enumeration-safe)", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "Login failed" });
  });

  test("returns generic 404 when membership missing", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "studio-a" },
          userId: { S: "alice" },
          cognitoUsername: { S: "opaque-uuid" },
        },
      })
      .mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "Login failed" });
  });

  test("resolves opaque cognitoUsername for nickname", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "studio-a" },
            userId: { S: "Alice" },
            cognitoUsername: { S: "11111111-2222-4333-8444-555555555555" },
          },
        ],
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "studio-a" },
          userId: { S: "Alice" },
          role: { S: "participant" },
        },
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      cognitoUsername: "11111111-2222-4333-8444-555555555555",
      nickname: "Alice",
    });
  });

  test("falls back to userId when cognitoUsername unset (legacy)", async () => {
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "studio-a" },
          userId: { S: "alice" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "studio-a" },
          userId: { S: "alice" },
          role: { S: "admin" },
        },
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      cognitoUsername: "alice",
      nickname: "alice",
    });
  });
});
