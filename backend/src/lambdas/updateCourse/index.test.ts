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

/** Leerer Tenant-Load → Default excludeLockWeeks (5). */
const tenantSettingsLoadResponse = {};

function mockAdminMembership() {
  return mockSend.mockResolvedValueOnce({ Item: { role: { S: "admin" } } }).mockResolvedValueOnce(
    tenantSettingsLoadResponse,
  );
}

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

const COURSE_UID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      TENANTS_TABLE: "test-tenants",
    };
    mockSend.mockReset();
    (GetItemCommand as unknown as jest.Mock).mockClear();
    (PutItemCommand as unknown as jest.Mock).mockClear();
    (QueryCommand as unknown as jest.Mock).mockClear();
    (ScanCommand as unknown as jest.Mock).mockClear();
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
    mockAdminMembership().mockResolvedValueOnce({});
    const result = await handler(makeEvent({ name: "Neu" }));
    expect(result.statusCode).toBe(404);
  });

  test("updates editable fields and keeps participants/dates", async () => {
    mockAdminMembership()
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
        courseUid: expect.stringMatching(COURSE_UID_REGEX),
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
          courseUid: { S: expect.stringMatching(COURSE_UID_REGEX) },
          participants: { L: [{ S: "luna" }] },
        }),
      }),
    );
  });

  test("rejects invalid status transition inactive -> active", async () => {
    mockAdminMembership()
      .mockResolvedValueOnce({ Item: baseCourseItem("inactive") });
    const result = await handler(makeEvent({ status: "active" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Invalid status transition/);
  });

  test("allows active -> draft for bounded_series without participants", async () => {
    mockAdminMembership()
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          participants: { L: [] },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent({ status: "draft" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe("draft");
  });

  test("allows active -> draft for rolling course without participants", async () => {
    mockAdminMembership()
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

  test("blocks active -> inactive when upcoming occurrences exist and course has participants", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockAdminMembership()
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

  test("allows active -> inactive for bounded_series without participants despite future dates", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    mockAdminMembership()
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          participants: { L: [] },
          dates: { L: [{ S: tomorrowIso }] },
        },
      })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent({ status: "inactive" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe("inactive");
  });

  test("allows active -> inactive without participants when override only has stale participants", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockAdminMembership()
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          participants: { L: [] },
          dates: { L: [{ S: tomorrow.toISOString().slice(0, 10) }] },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            date: { S: tomorrow.toISOString().slice(0, 10) },
            participants: { L: [{ S: "luna" }] },
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent({ status: "inactive" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe("inactive");
    expect(ScanCommand).toHaveBeenCalled();
  });

  test("blocks active -> inactive when open overrides exist", async () => {
    mockAdminMembership()
      .mockResolvedValueOnce({ Item: baseCourseItem("active") })
      .mockResolvedValueOnce({
        Items: [
          {
            date: { S: "2099-01-06" },
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
    mockAdminMembership()
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

    mockAdminMembership()
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
          courseUid: { S: expect.stringMatching(COURSE_UID_REGEX) },
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

    mockAdminMembership()
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
    mockAdminMembership()
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

  test("updates course participants list", async () => {
    mockAdminMembership()
      .mockResolvedValueOnce({ Item: baseCourseItem("draft") })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        participants: ["alice", "bob"],
      }),
    );
    expect(result.statusCode).toBe(200);
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          courseUid: { S: expect.stringMatching(COURSE_UID_REGEX) },
          participants: { L: [{ S: "alice" }, { S: "bob" }] },
        }),
      }),
    );
    expect(JSON.parse(result.body).participants).toEqual(["alice", "bob"]);
  });

  test("prunes out-of-window exceptions for bounded_series", async () => {
    mockAdminMembership()
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
          courseUid: { S: expect.stringMatching(COURSE_UID_REGEX) },
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

    mockAdminMembership()
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
          courseUid: { S: expect.stringMatching(COURSE_UID_REGEX) },
          excludedDates: { L: [{ S: farFutureIso }] },
        }),
      }),
    );
    expect(JSON.parse(result.body).excludedDates).toEqual([farFutureIso]);
  });

  test("auto-sets active bounded_series to inactive when no future visible dates remain", async () => {
    mockAdminMembership()
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
          courseUid: { S: expect.stringMatching(COURSE_UID_REGEX) },
          status: { S: "inactive" },
        }),
      }),
    );
    expect(JSON.parse(result.body).status).toBe("inactive");
  });

  test("syncs added participants into relevant future overrides for active courses", async () => {
    const futureDateIso = "2099-01-06";
    const pastDateIso = "2020-01-01";

    mockAdminMembership()
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("active"),
          participants: { L: [{ S: "luna" }] },
          time: { S: "18:00" },
          seriesStartDate: { S: "2099-01-01" },
          seriesEndDate: { S: "2099-12-31" },
          visibleFrom: { S: "2099-01-01" },
          visibleUntil: { S: "2099-12-31" },
        },
      })
      .mockResolvedValueOnce({}) // course update
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            courseId_date: { S: `1_${futureDateIso}` },
            courseId: { S: "1" },
            date: { S: futureDateIso },
            participants: { L: [{ S: "luna" }] },
            swapped: { L: [] },
            waitlist: { L: [] },
          },
          {
            tenantId: { S: "default-tenant" },
            courseId_date: { S: `1_${pastDateIso}` },
            courseId: { S: "1" },
            date: { S: pastDateIso },
            participants: { L: [{ S: "luna" }] },
            swapped: { L: [] },
            waitlist: { L: [] },
          },
        ],
      })
      .mockResolvedValueOnce({}); // future override update

    const result = await handler(
      makeEvent({
        participants: ["luna", "maya"],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(QueryCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-overrides",
      }),
    );

    const overrideWrites = (PutItemCommand as unknown as jest.Mock).mock.calls
      .map((call) => call[0])
      .filter((input) => input?.TableName === "test-overrides");
    expect(overrideWrites).toHaveLength(1);
    expect(overrideWrites[0].Item.courseId_date.S).toBe(`1_${futureDateIso}`);
    expect(overrideWrites[0].Item.courseUid.S).toMatch(COURSE_UID_REGEX);
    expect(overrideWrites[0].Item.participants.L).toEqual([{ S: "luna" }, { S: "maya" }]);
  });
});
