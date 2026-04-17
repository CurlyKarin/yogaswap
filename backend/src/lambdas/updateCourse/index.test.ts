import { APIGatewayProxyEvent } from "aws-lambda";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    ScanCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

function makeEvent(
  body: unknown,
  pathCourseId = "1",
  headers?: Record<string, string>,
): APIGatewayProxyEvent {
  return ({
    body: body == null ? null : JSON.stringify(body),
    headers: headers ?? {},
    pathParameters: { courseId: pathCourseId },
    requestContext: {
      authorizer: {
        jwt: { claims: { nickname: "admin1" } },
      },
    } as unknown as APIGatewayProxyEvent["requestContext"],
  } as unknown) as APIGatewayProxyEvent;
}

function baseCourseItem(status = "draft") {
  return {
    tenantId: { S: "default-tenant" },
    courseId: { S: "1" },
    id: { N: "1" },
    name: { S: "Alt" },
    weekday: { S: "Mon" },
    time: { S: "09:00" },
    capacity: { N: "12" },
    status: { S: status },
    participants: { L: [{ S: "luna" }] },
    dates: { L: [] },
  };
}

describe("updateCourse Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      COURSES_TABLE: "test-courses",
      MEMBERSHIPS_TABLE: "test-memberships",
      OVERRIDES_TABLE: "test-overrides",
      SWAPS_TABLE: "test-swaps",
    };
    mockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("returns 403 for non-admin", async () => {
    mockSend.mockResolvedValueOnce({ Item: { role: { S: "instructor" } } });
    const result = await handler(makeEvent({ name: "Neu" }));
    expect(result.statusCode).toBe(403);
    expect(GetItemCommand).toHaveBeenCalled();
  });

  test("returns 404 when course not found", async () => {
    mockSend.mockResolvedValueOnce({ Item: { role: { S: "admin" } } }).mockResolvedValueOnce({});
    const result = await handler(makeEvent({ name: "Neu" }));
    expect(result.statusCode).toBe(404);
  });

  test("updates editable fields and keeps participants/dates", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("draft") })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ name: "Morgenkurs", weekday: "Tue", time: "08:00", capacity: 16 }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toEqual(
      expect.objectContaining({
        courseId: "1",
        name: "Morgenkurs",
        weekday: "Tue",
        time: "08:00",
        capacity: 16,
        status: "draft",
      }),
    );
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-courses",
        Item: expect.objectContaining({
          participants: { L: [{ S: "luna" }] },
        }),
      }),
    );
  });

  test("rejects invalid status transition inactive -> active", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("inactive") });
    const result = await handler(makeEvent({ status: "active" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Invalid status transition/);
  });

  test("blocks active -> inactive when future dates exist", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          dates: { L: [{ S: tomorrow.toISOString().slice(0, 10) }] },
        },
      });

    const result = await handler(makeEvent({ status: "inactive" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Kurs kann nicht deaktiviert werden/);
  });

  test("blocks active -> inactive when open overrides/swaps exist", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("active") })
      .mockResolvedValueOnce({
        Items: [
          {
            date: { S: new Date().toISOString().slice(0, 10) },
            participants: { L: [{ S: "luna" }] },
          },
        ],
      });

    const result = await handler(makeEvent({ status: "inactive" }));
    expect(result.statusCode).toBe(400);
    expect(QueryCommand).toHaveBeenCalled();
    expect(ScanCommand).not.toHaveBeenCalled();
  });

  test("allows active -> inactive when no open dates/refs", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          dates: { L: [{ S: oldDate.toISOString().slice(0, 10) }] },
        },
      })
      .mockResolvedValueOnce({ Items: [] }) // overrides query
      .mockResolvedValueOnce({ Items: [] }) // swaps scan
      .mockResolvedValueOnce({}); // put

    const result = await handler(makeEvent({ status: "inactive" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe("inactive");
    expect(QueryCommand).toHaveBeenCalled();
    expect(ScanCommand).toHaveBeenCalled();
  });
});
