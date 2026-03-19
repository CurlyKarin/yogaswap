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
    process.env = { ...OLD_ENV, PARTICIPANTS_TABLE: "test-participants" };
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
      requestContext: {} as any,
      ...overrides,
    } as any);

  test("updates participant profile successfully", async () => {
    mockSend
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
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test("returns 404 if participant does not exist", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe("Participant not found");
  });

  test("returns 400 for invalid settings payload", async () => {
    mockSend.mockResolvedValueOnce({
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
});

