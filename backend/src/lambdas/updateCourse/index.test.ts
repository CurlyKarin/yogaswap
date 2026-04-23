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
    planningMode: { S: "bounded_series" },
    visibilityMode: { S: "fixed_window" },
    seriesStartDate: { S: "2026-01-01" },
    seriesEndDate: { S: "2026-03-31" },
    visibleFrom: { S: "2026-01-01" },
    visibleUntil: { S: "2026-03-31" },
    excludedDates: { L: [{ S: "2026-02-02" }] },
    includedDates: { L: [{ S: "2026-02-04" }] },
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

  test("allows active -> draft for rolling course without participants", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          planningMode: { S: "rolling_continuous" },
          visibilityMode: { S: "rolling_horizon" },
          visibilityHorizonWeeks: { N: "8" },
          participants: { L: [] },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent({ status: "draft" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe("draft");
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

  test("updates scheduling model fields", async () => {
    const allowed = new Date();
    allowed.setDate(allowed.getDate() + 50);
    const allowedIso = allowed.toISOString().slice(0, 10);

    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("draft") })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        visibilityHorizonWeeks: 10,
        excludedDates: [allowedIso],
        includedDates: [],
      }),
    );
    expect(result.statusCode).toBe(200);

    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          planningMode: { S: "rolling_continuous" },
          visibilityMode: { S: "rolling_horizon" },
          visibilityHorizonWeeks: { N: "10" },
          excludedDates: { L: [{ S: allowedIso }] },
        }),
      }),
    );

    const body = JSON.parse(result.body);
    expect(body).toEqual(
      expect.objectContaining({
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        visibilityHorizonWeeks: 10,
        excludedDates: [allowedIso],
      }),
    );
  });

  test("blocks adding excludedDates inside rolling lock window", async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const soonIso = soon.toISOString().slice(0, 10);

    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("draft") });

    const result = await handler(
      makeEvent({
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        visibilityHorizonWeeks: 10,
        excludedDates: [soonIso],
        includedDates: [],
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/dürfen nicht ausgeschlossen werden/i);
  });

  test("rejects invalid fixed window range on update", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("draft") });

    const result = await handler(
      makeEvent({
        visibilityMode: "fixed_window",
        visibleFrom: "2026-03-31",
        visibleUntil: "2026-01-01",
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/visibleFrom and visibleUntil/);
  });

  test("prunes out-of-window exceptions for bounded_series", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({ Item: baseCourseItem("draft") })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        excludedDates: ["2025-12-29", "2026-02-02", "2026-04-06"],
        includedDates: ["2025-12-31", "2026-02-04", "2026-05-01"],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          excludedDates: { L: [{ S: "2026-02-02" }] },
          includedDates: { L: [{ S: "2026-02-04" }] },
        }),
      }),
    );
    const body = JSON.parse(result.body);
    expect(body.excludedDates).toEqual(["2026-02-02"]);
    expect(body.includedDates).toEqual(["2026-02-04"]);
  });

  test("keeps far-future exceptions for rolling_continuous and prunes only stale past", async () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 240);
    const farFutureIso = farFuture.toISOString().slice(0, 10);
    const stalePast = new Date();
    stalePast.setDate(stalePast.getDate() - 40);
    const stalePastIso = stalePast.toISOString().slice(0, 10);

    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("draft"),
          planningMode: { S: "rolling_continuous" },
          visibilityMode: { S: "rolling_horizon" },
          visibilityHorizonWeeks: { N: "10" },
          excludedDates: { L: [] },
          includedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        visibilityHorizonWeeks: 10,
        excludedDates: [stalePastIso, farFutureIso],
        includedDates: [],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          excludedDates: { L: [{ S: farFutureIso }] },
        }),
      }),
    );
    expect(JSON.parse(result.body).excludedDates).toEqual([farFutureIso]);
  });

  test("auto-sets active bounded_series to inactive when no future visible dates remain", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          seriesStartDate: { S: "2020-01-01" },
          seriesEndDate: { S: "2020-01-31" },
          visibleFrom: { S: "2020-01-01" },
          visibleUntil: { S: "2020-01-31" },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent({ name: "Vergangener Kursblock" }));
    expect(result.statusCode).toBe(200);
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          status: { S: "inactive" },
        }),
      }),
    );
    expect(JSON.parse(result.body).status).toBe("inactive");
  });
});
