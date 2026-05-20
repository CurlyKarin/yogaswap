import { APIGatewayProxyEvent } from "aws-lambda";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
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

function makeEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    requestContext: {
      authorizer: { jwt: { claims: { nickname: "admin1" } } },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe("updateTenantSettings Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      TENANTS_TABLE: "test-tenants",
      MEMBERSHIPS_TABLE: "test-memberships",
    };
    mockSend.mockReset();
    (GetItemCommand as unknown as jest.Mock).mockClear();
    (PutItemCommand as unknown as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("returns 403 for non-admin", async () => {
    mockSend.mockResolvedValueOnce({ Item: { role: { S: "instructor" } } });
    const result = await handler(makeEvent({ name: "Studio" }));
    expect(result.statusCode).toBe(403);
  });

  test("updates name and MVP settings while preserving other settings", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Alt" },
          settings: {
            M: {
              instructorCanSeeAllCourses: { BOOL: true },
              inactiveGraceDaysAfterCourseEnd: { N: "7" },
            },
          },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        name: "Pilot Studio",
        inactiveGraceDaysAfterCourseEnd: 10,
        minOffsetDays: -14,
        maxOffsetDays: 14,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.name).toBe("Pilot Studio");
    expect(body.settings).toMatchObject({
      instructorCanSeeAllCourses: true,
      inactiveGraceDaysAfterCourseEnd: 10,
      minOffsetDays: -14,
      maxOffsetDays: 14,
    });
    expect(PutItemCommand).toHaveBeenCalled();
  });

  test("rejects invalid swap window", async () => {
    mockSend.mockResolvedValueOnce({ Item: { role: { S: "admin" } } });
    const result = await handler(
      makeEvent({
        minOffsetDays: 5,
        maxOffsetDays: 2,
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/frühestens/);
  });
});
