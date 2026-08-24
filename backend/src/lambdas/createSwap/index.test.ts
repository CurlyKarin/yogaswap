import { APIGatewayProxyEvent } from "aws-lambda";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
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
      authorizer: { jwt: { claims: { nickname: "alice" } } },
    },
  } as unknown as APIGatewayProxyEvent;
}

const baseCourseItem = (id: string, capacity: string, overbook = "0", participants: string[] = []) => ({
  time: { S: "10:00" },
  capacity: { N: capacity },
  overbookLimit: { N: overbook },
  participants: { L: participants.map((p) => ({ S: p })) },
  courseUid: { S: `uid-${id}` },
});

describe("createSwap capacity guard", () => {
  beforeEach(() => {
    mockSend.mockReset();
    (PutItemCommand as unknown as jest.Mock).mockClear();
    process.env.SWAPS_TABLE = "test-swaps";
    process.env.COURSES_TABLE = "test-courses";
    process.env.OVERRIDES_TABLE = "test-overrides";
  });

  it("rejects active swap when target term is at maxCapacity", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: baseCourseItem("1", "2", "0", ["alice"]) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: baseCourseItem("2", "2", "0", ["b1", "b2"]) })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        user: "alice",
        fromCourseId: 1,
        fromDate: "2099-06-16",
        toCourseId: 2,
        toDate: "2099-06-17",
        status: "active",
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/voll/i);
    expect(PutItemCommand).not.toHaveBeenCalled();
  });

  it("rejects active swap when target is only overbook headroom", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: baseCourseItem("1", "2", "0", ["alice"]) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: baseCourseItem("2", "2", "1", ["b1", "b2"]) })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        user: "alice",
        fromCourseId: 1,
        fromDate: "2099-06-16",
        toCourseId: 2,
        toDate: "2099-06-17",
        status: "active",
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/regulär voll/i);
    expect(PutItemCommand).not.toHaveBeenCalled();
  });

  it("allows active swap when target has regular capacity headroom", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: baseCourseItem("1", "2", "0", ["alice"]) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: baseCourseItem("2", "2", "1", ["b1"]) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { courseUid: { S: "uid-1" } } })
      .mockResolvedValueOnce({ Item: { courseUid: { S: "uid-2" } } })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        user: "alice",
        fromCourseId: 1,
        fromDate: "2099-06-16",
        toCourseId: 2,
        toDate: "2099-06-17",
        status: "active",
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(PutItemCommand).toHaveBeenCalled();
  });

  it("rejects pending swap when target term is inside cutoff window", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-09-01T06:15:00.000Z"));
    mockSend
      .mockResolvedValueOnce({ Item: baseCourseItem("1", "2", "0", ["alice"]) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: { ...baseCourseItem("2", "2", "0", ["b1"]), time: { S: "06:30" } },
      });

    const result = await handler(
      makeEvent({
        user: "alice",
        fromCourseId: 1,
        fromDate: "2099-06-16",
        toCourseId: 2,
        toDate: "2025-09-01",
        status: "pending",
      }),
    );

    jest.useRealTimers();

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Zieltermin/i);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("rejects swap after bounded series end date", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
    mockSend.mockResolvedValueOnce({
      Item: {
        ...baseCourseItem("1", "8", "0", ["alice"]),
        planningMode: { S: "bounded_series" },
        seriesEndDate: { S: "2026-05-15" },
      },
    });

    const result = await handler(
      makeEvent({
        user: "alice",
        fromCourseId: 1,
        fromDate: "2026-05-12",
        toCourseId: 2,
        toDate: "2026-05-19",
        status: "pending",
      }),
    );

    jest.useRealTimers();
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Endedatum/);
    expect(PutItemCommand).not.toHaveBeenCalled();
  });

  it("rejects swap to a bounded target date after that course seriesEndDate", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    mockSend
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("1", "8", "0", ["alice"]),
          planningMode: { S: "bounded_series" },
          seriesEndDate: { S: "2026-05-31" },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          ...baseCourseItem("2", "8", "0", ["bob"]),
          planningMode: { S: "bounded_series" },
          seriesEndDate: { S: "2026-05-15" },
        },
      });

    const result = await handler(
      makeEvent({
        user: "alice",
        fromCourseId: 1,
        fromDate: "2026-05-12",
        toCourseId: 2,
        toDate: "2026-05-20",
        status: "pending",
      }),
    );

    jest.useRealTimers();
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Endedatum/);
    expect(PutItemCommand).not.toHaveBeenCalled();
  });
});
