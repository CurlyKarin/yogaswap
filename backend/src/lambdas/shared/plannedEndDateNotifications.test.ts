import { notifyParticipantsPlannedEndDate } from "./plannedEndDateNotifications";

jest.mock("@aws-sdk/client-ses", () => {
  const mockSesSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: mockSesSend })),
    SendEmailCommand: jest.fn((input) => input),
    mockSesSend,
  };
});

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSesSend } = jest.requireMock("@aws-sdk/client-ses");
const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const client = { send: mockSend } as unknown as import("@aws-sdk/client-dynamodb").DynamoDBClient;

describe("plannedEndDateNotifications", () => {
  beforeEach(() => {
    mockSesSend.mockReset();
    mockSend.mockReset();
  });

  test("skips when participants table or ses is missing", async () => {
    const result = await notifyParticipantsPlannedEndDate(client, {
      tenantId: "t1",
      courseName: "Yoga",
      change: "set",
      plannedEndDateIso: "2026-06-20",
      participantUserIds: ["luna"],
    });
    expect(result).toEqual({
      mailSentCount: 0,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailFailedCount: 0,
    });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  test("sends mail to active participant and skips invited", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          email: { S: "luna@example.com" },
          authUserId: { S: "auth-luna" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          email: { S: "neo@example.com" },
          inviteSentAt: { S: "2026-01-01T00:00:00.000Z" },
        },
      });
    mockSesSend.mockResolvedValue({});

    const result = await notifyParticipantsPlannedEndDate(client, {
      participantsTable: "participants",
      sesSourceEmail: "studio@example.com",
      tenantId: "t1",
      courseName: "Flow",
      change: "set",
      plannedEndDateIso: "2026-06-20",
      participantUserIds: ["luna", "neo"],
    });

    expect(result).toEqual({
      mailSentCount: 1,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 1,
      mailFailedCount: 0,
    });
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});
