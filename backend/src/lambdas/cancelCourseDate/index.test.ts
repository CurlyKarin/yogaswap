import { APIGatewayProxyEvent } from "aws-lambda";
import {
  DeleteItemCommand,
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
    DeleteItemCommand: jest.fn((input) => input),
    GetItemCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    ScanCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("@aws-sdk/client-ses", () => {
  const sesSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: sesSend })),
    SendEmailCommand: jest.fn((input) => input),
    sesSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const { sesSend } = jest.requireMock("@aws-sdk/client-ses");

function makeEvent(): APIGatewayProxyEvent {
  return ({
    body: JSON.stringify({
      rollbackOutgoingSwapsFromCancelledParticipants: true,
      notifyAlreadyCancelledParticipants: true,
    }),
    headers: {},
    pathParameters: { courseId: "1", date: "2099-01-06" },
    requestContext: {
      authorizer: {
        jwt: { claims: { nickname: "admin1" } },
      },
    } as unknown as APIGatewayProxyEvent["requestContext"],
  } as unknown) as APIGatewayProxyEvent;
}

function makeEventNoRollback(): APIGatewayProxyEvent {
  return ({
    body: JSON.stringify({
      rollbackOutgoingSwapsFromCancelledParticipants: false,
      notifyAlreadyCancelledParticipants: true,
    }),
    headers: {},
    pathParameters: { courseId: "1", date: "2099-01-06" },
    requestContext: {
      authorizer: {
        jwt: { claims: { nickname: "admin1" } },
      },
    } as unknown as APIGatewayProxyEvent["requestContext"],
  } as unknown) as APIGatewayProxyEvent;
}

describe("cancelCourseDate Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      COURSES_TABLE: "test-courses",
      MEMBERSHIPS_TABLE: "test-memberships",
      OVERRIDES_TABLE: "test-overrides",
      SWAPS_TABLE: "test-swaps",
      PARTICIPANTS_TABLE: "test-participants",
      SES_SOURCE_EMAIL: "studio@example.com",
    };
    mockSend.mockReset();
    sesSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("cancels date and returns impact groups", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "luna" }, { S: "maya" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2026-01-06" },
          participants: { L: [{ S: "luna" }] },
          swapped: { L: [{ S: "nora" }] },
          waitlist: { L: [{ S: "maya" }] },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            user_swapId: { S: "maya#2026-01-06_1_2026-01-09_2" },
            user: { S: "maya" },
            fromCourseId: { S: "1" },
            fromDate: { S: "2099-01-06" },
            toCourseId: { S: "2" },
            toDate: { S: "2099-01-09" },
            status: { S: "pending" },
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { email: { S: "luna@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "nora@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "maya@example.com" } } });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body);
    expect(payload.success).toBe(true);
    expect(payload.affected).toEqual(
      expect.objectContaining({
        bookedParticipants: ["luna"],
        swappedInParticipants: ["nora"],
        waitlistParticipants: ["maya"],
        alreadyCancelledParticipants: ["maya"],
        outgoingSwapsFromCancelledParticipants: ["maya"],
      }),
    );

    expect(ScanCommand).toHaveBeenCalled();
    expect(DeleteItemCommand).toHaveBeenCalledTimes(1);
    expect(PutItemCommand).toHaveBeenCalledTimes(2);
    expect(GetItemCommand).toHaveBeenCalled();
    expect(QueryCommand).not.toHaveBeenCalled();
    expect(sesSend).toHaveBeenCalledTimes(3);
  });

  test("keeps outgoing pending swaps from already-cancelled participants when rollback is false", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "luna" }, { S: "maya" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2099-01-06" },
          participants: { L: [{ S: "luna" }] },
          swapped: { L: [{ S: "nora" }] },
          waitlist: { L: [{ S: "maya" }] },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            user_swapId: { S: "maya#2099-01-06_1_2099-01-09_2" },
            user: { S: "maya" },
            fromCourseId: { S: "1" },
            fromDate: { S: "2099-01-06" },
            toCourseId: { S: "2" },
            toDate: { S: "2099-01-09" },
            status: { S: "pending" },
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { email: { S: "luna@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "nora@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "maya@example.com" } } });

    const result = await handler(makeEventNoRollback());
    expect(result.statusCode).toBe(200);
    expect(DeleteItemCommand).not.toHaveBeenCalled();
    expect(PutItemCommand).toHaveBeenCalledTimes(2);
    expect(sesSend).toHaveBeenCalledTimes(3);
  });

  test("resolves participant profile case-insensitively via normalized lookup", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "Rue" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2099-01-06" },
          participants: { L: [{ S: "Rue" }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            userId: { S: "rue" },
            userIdNormalized: { S: "rue" },
            email: { S: "rue@example.com" },
          },
        ],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(GetItemCommand).toHaveBeenCalled();
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(sesSend).toHaveBeenCalledTimes(1); // user mail
  });

  test("does not send cancellation mails to invited-only participants", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "Aria" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2099-01-06" },
          participants: { L: [{ S: "Aria" }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          email: { S: "aria@example.com" },
          inviteSentAt: { S: "2026-05-01T10:00:00.000Z" },
        },
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(GetItemCommand).toHaveBeenCalled();
    expect(sesSend).not.toHaveBeenCalled();
  });

  test("sends cancellation mail to waitlist participants on cancelled date", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "luna" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2099-01-06" },
          participants: { L: [{ S: "luna" }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: "zoe" }] },
        },
      })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { email: { S: "luna@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "zoe@example.com" } } });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(sesSend).toHaveBeenCalledTimes(2);
  });

  test("studio report includes waitlist and cancelled users with active swaps", async () => {
    process.env.STUDIO_NOTIFICATION_EMAILS = "studio@example.com";
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "4" },
          name: { S: "YogaMi" },
          participants: { L: [{ S: "Luna" }, { S: "Skye" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "4_2026-05-13" },
          participants: { L: [{ S: "kai" }, { S: "Skye" }] },
          swapped: { L: [{ S: "kai" }] },
          waitlist: { L: [{ S: "Maya" }] },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            user_swapId: { S: "Luna#2026-05-13_4_2026-05-14_5" },
            user: { S: "Luna" },
            fromCourseId: { S: "4" },
            fromDate: { S: "2026-05-13" },
            toCourseId: { S: "5" },
            toDate: { S: "2026-05-14" },
            status: { S: "active" },
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { email: { S: "kai@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "skye@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "maya@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "luna@example.com" } } });

    const event = ({
      body: JSON.stringify({
        rollbackOutgoingSwapsFromCancelledParticipants: true,
        notifyAlreadyCancelledParticipants: true,
      }),
      headers: {},
      pathParameters: { courseId: "4", date: "2026-05-13" },
      requestContext: {
        authorizer: {
          jwt: { claims: { nickname: "admin" } },
        },
      },
    } as unknown) as APIGatewayProxyEvent;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const reportCall = sesSend.mock.calls[sesSend.mock.calls.length - 1]?.[0];
    const reportHtml = reportCall?.Message?.Body?.Html?.Data ?? "";
    expect(reportHtml).toContain("Warteliste betroffen: Maya");
    expect(reportHtml).toContain("Abgesagt mit aktivem Swap: Luna");
  });

  test("removes users from target override waitlist when deleting pending outgoing swaps", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "luna" }, { S: "maya" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2099-01-06" },
          participants: { L: [{ S: "luna" }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            tenantId: { S: "default-tenant" },
            user_swapId: { S: "luna#2099-01-06_1_2099-01-09_2" },
            user: { S: "luna" },
            fromCourseId: { S: "1" },
            fromDate: { S: "2099-01-06" },
            toCourseId: { S: "2" },
            toDate: { S: "2099-01-09" },
            status: { S: "pending" },
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "2_2099-01-09" },
          courseId: { S: "2" },
          date: { S: "2099-01-09" },
          participants: { L: [{ S: "zoe" }] },
          swapped: { L: [] },
          waitlist: { L: [{ S: "luna" }, { S: "mia" }] },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { email: { S: "luna@example.com" } } })
      .mockResolvedValueOnce({ Item: { email: { S: "maya@example.com" } } });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    const putCalls = (PutItemCommand as unknown as jest.Mock).mock.calls.map((call) => call[0]);
    const targetOverrideUpdate = putCalls.find(
      (input) => input?.TableName === "test-overrides" && input?.Item?.courseId_date?.S === "2_2099-01-09",
    );
    expect(targetOverrideUpdate).toBeDefined();
    expect(targetOverrideUpdate.Item.waitlist.L).toEqual([{ S: "mia" }]);
  });

  test("continues successfully when participant lookup fails for one recipient", async () => {
    process.env.STUDIO_NOTIFICATION_EMAILS = "studio@example.com";
    mockSend
      .mockResolvedValueOnce({ Item: { role: { S: "admin" } } })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId: { S: "1" },
          name: { S: "Kurs A" },
          participants: { L: [{ S: "luna" }] },
          excludedDates: { L: [] },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          courseId_date: { S: "1_2099-01-06" },
          participants: { L: [{ S: "luna" }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("participants lookup transient error"))
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(sesSend).toHaveBeenCalledTimes(1); // only studio report mail
  });
});

