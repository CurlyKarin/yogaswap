import { APIGatewayProxyEvent } from "aws-lambda";
import { GetItemCommand, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

function makeEvent(body: unknown, headers?: Record<string, string>): APIGatewayProxyEvent {
  return {
    body: body == null ? null : JSON.stringify(body),
    headers: headers ?? {},
    requestContext: {
      authorizer: {
        jwt: { claims: { nickname: "admin1" } },
      },
    } as unknown as APIGatewayProxyEvent["requestContext"],
  } as APIGatewayProxyEvent;
}

describe("createCourse Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      COURSES_TABLE: "test-courses",
      MEMBERSHIPS_TABLE: "test-memberships",
    };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("returns 500 when required env vars are missing", async () => {
    delete process.env.COURSES_TABLE;
    const result = await handler(makeEvent({}));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toMatch(/COURSES_TABLE or MEMBERSHIPS_TABLE/);
  });

  test("returns 403 when actor is missing", async () => {
    const event = {
      body: JSON.stringify({ name: "Yoga", weekday: "Mon", time: "18:00", capacity: 10 }),
      headers: {},
      requestContext: {},
    } as APIGatewayProxyEvent;
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  test("returns 403 for non-admin membership role", async () => {
    mockSend.mockResolvedValueOnce({ Item: { role: { S: "instructor" } } });
    const result = await handler(makeEvent({ name: "Yoga", weekday: "Mon", time: "18:00", capacity: 10 }));
    expect(result.statusCode).toBe(403);
    expect(GetItemCommand).toHaveBeenCalled();
  });

  test("returns 400 on invalid input", async () => {
    const result = await handler(makeEvent({ name: " ", weekday: "Mon", time: "18:99", capacity: -1 }));
    expect(result.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("creates course with default draft status", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Items: [{ courseId: { S: "1" } }, { id: { N: "4" } }],
      })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent(
        { name: "Morgen Flow", weekday: "Mon", time: "08:30", capacity: 12 },
        { "x-tenant-id": "studio-a" },
      ),
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body).toEqual(
      expect.objectContaining({
        id: 5,
        courseId: "5",
        name: "Morgen Flow",
        weekday: "Mon",
        time: "08:30",
        capacity: 12,
        status: "draft",
      }),
    );

    expect(GetItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-memberships",
        Key: {
          tenantId: { S: "studio-a" },
          userId: { S: "admin1" },
        },
      }),
    );
    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-courses",
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: "studio-a" } },
      }),
    );
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-courses",
        Item: expect.objectContaining({
          tenantId: { S: "studio-a" },
          courseId: { S: "5" },
          id: { N: "5" },
          status: { S: "draft" },
        }),
      }),
    );
  });

  test("returns 409 on id collision", async () => {
    const condErr = new Error("collision");
    (condErr as { name?: string }).name = "ConditionalCheckFailedException";

    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Items: [] })
      .mockRejectedValueOnce(condErr);

    const result = await handler(
      makeEvent({ name: "Yoga", weekday: "Mon", time: "10:00", capacity: 8, status: "inactive" }),
    );

    expect(result.statusCode).toBe(409);
  });
});
