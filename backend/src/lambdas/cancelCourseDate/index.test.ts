import { APIGatewayProxyEvent } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
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
    pathParameters: { courseId: "1", date: "2026-01-06" },
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
            fromDate: { S: "2026-01-06" },
            toCourseId: { S: "2" },
            toDate: { S: "2026-01-09" },
            status: { S: "pending" },
          },
        ],
      })
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
      }),
    );

    expect(ScanCommand).toHaveBeenCalled();
    expect(DeleteItemCommand).toHaveBeenCalledTimes(1);
    expect(PutItemCommand).toHaveBeenCalledTimes(2);
    expect(GetItemCommand).toHaveBeenCalled();
    expect(sesSend).toHaveBeenCalledTimes(3);
  });
});

