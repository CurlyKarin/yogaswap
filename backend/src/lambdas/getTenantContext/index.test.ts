import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("getTenantContext Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      TENANTS_TABLE: "test-tenants",
      MEMBERSHIPS_TABLE: "test-memberships",
    };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: {},
      requestContext: { authorizer: { principalId: "alice" } } as any,
      ...overrides,
    } as any);

  test("returns tenant and membership when both exist", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "yogaswap-demo" },
          name: { S: "YogaSwap Demo Studio" },
          settings: {
            M: {
              instructorCanSeeAllCourses: { BOOL: true },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "yogaswap-demo" },
          userId: { S: "alice" },
          role: { S: "admin" },
        },
      });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body.tenantId).toBe("default-tenant");
    expect(body.userId).toBe("alice");
    expect(body.tenant).toMatchObject({
      tenantId: "yogaswap-demo",
      name: "YogaSwap Demo Studio",
    });
    expect(body.membership).toMatchObject({
      tenantId: "yogaswap-demo",
      userId: "alice",
      role: "admin",
    });

    expect(GetItemCommand).toHaveBeenCalledTimes(2);
  });

  test("returns 500 when tables env vars are missing", async () => {
    process.env.TENANTS_TABLE = "";
    process.env.MEMBERSHIPS_TABLE = "";

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toMatch(/TENANTS_TABLE or MEMBERSHIPS_TABLE/);
  });
});

