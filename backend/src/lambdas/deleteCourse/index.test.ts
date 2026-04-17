import { APIGatewayProxyEvent } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    DeleteItemCommand: jest.fn((input) => input),
    GetItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    ScanCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

function makeEvent(pathCourseId = "1", headers?: Record<string, string>): APIGatewayProxyEvent {
  return ({
    body: null,
    headers: headers ?? {},
    pathParameters: { courseId: pathCourseId },
    requestContext: {
      authorizer: {
        jwt: { claims: { nickname: "admin1" } },
      },
    } as unknown as APIGatewayProxyEvent["requestContext"],
  } as unknown) as APIGatewayProxyEvent;
}

function baseCourseItem(status = "inactive") {
  return {
    tenantId: { S: "default-tenant" },
    courseId: { S: "1" },
    id: { N: "1" },
    name: { S: "Alt" },
    weekday: { S: "Mon" },
    time: { S: "09:00" },
    capacity: { N: "12" },
    status: { S: status },
    participants: { L: [] },
    dates: { L: [] },
  };
}

describe("deleteCourse Lambda", () => {
  const OLD_ENV = process.env;
  const deleteError =
    "Kurs kann nicht gelöscht werden: Nur deaktivierte Kurse ohne offene Termin-/Tauschbezüge sind löschbar.";

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
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
    expect(GetItemCommand).toHaveBeenCalled();
  });

  test("returns 404 when course not found", async () => {
    mockSend.mockResolvedValueOnce({ Item: { role: { S: "admin" } } }).mockResolvedValueOnce({});
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  test("blocks delete when status is not inactive", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("active") });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe(deleteError);
  });

  test("blocks delete when participants still exist", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: { ...baseCourseItem("inactive"), participants: { L: [{ S: "luna" }] } },
      });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe(deleteError);
  });

  test("blocks delete when future dates exist", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: { ...baseCourseItem("inactive"), dates: { L: [{ S: tomorrow.toISOString().slice(0, 10) }] } },
      });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe(deleteError);
  });

  test("blocks delete when open overrides exist", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("inactive") })
      .mockResolvedValueOnce({
        Items: [{ date: { S: new Date().toISOString().slice(0, 10) }, participants: { L: [{ S: "luna" }] } }],
      });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(QueryCommand).toHaveBeenCalled();
    expect(ScanCommand).not.toHaveBeenCalled();
  });

  test("blocks delete when open swaps exist", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("inactive") })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [{ tenantId: { S: "default-tenant" } }] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(ScanCommand).toHaveBeenCalled();
    expect(JSON.parse(result.body).error).toBe(deleteError);
  });

  test("deletes course when all conditions are met", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("inactive") })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent("1", { "x-tenant-id": "studio-a" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, courseId: "1" });
    expect(DeleteItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-courses",
        Key: {
          tenantId: { S: "studio-a" },
          courseId: { S: "1" },
        },
      }),
    );
  });
});
