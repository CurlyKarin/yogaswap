import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const mockSesSend = jest.fn();
const mockResolveParticipantEmail = jest.fn();

jest.mock("@aws-sdk/client-ses", () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((input) => input),
  SendRawEmailCommand: jest.fn((input) => input),
}));

jest.mock("../participantEmailLookup", () => ({
  resolveParticipantEmail: (...args: unknown[]) => mockResolveParticipantEmail(...args),
}));

import { sendMailToParticipantUserIds } from "./sendParticipantEmail";

describe("sendMailToParticipantUserIds (#437)", () => {
  const client = {} as DynamoDBClient;

  beforeEach(() => {
    mockSesSend.mockReset();
    mockResolveParticipantEmail.mockReset();
  });

  test("skips recipients who opted out of the category", async () => {
    mockResolveParticipantEmail
      .mockResolvedValueOnce({
        email: "on@example.com",
        resolvedUserId: "on",
        status: "active",
        settings: { notifications: { studioCourseEmail: true } },
      })
      .mockResolvedValueOnce({
        email: "off@example.com",
        resolvedUserId: "off",
        status: "active",
        settings: { notifications: { studioCourseEmail: false } },
      });
    mockSesSend.mockResolvedValue({});

    const summary = await sendMailToParticipantUserIds(client, {
      participantsTable: "participants",
      sesSourceEmail: "studio@example.com",
      tenantId: "t1",
      participantUserIds: ["on", "off"],
      emailNotificationCategory: "studioCourse",
      buildMail: () => ({ subject: "Hi", html: "<p>Hi</p>" }),
    });

    expect(summary).toEqual({
      mailSentCount: 1,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailSkippedOptOutCount: 1,
      mailFailedCount: 0,
    });
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  test("sends when category is omitted even if prefs are off", async () => {
    mockResolveParticipantEmail.mockResolvedValueOnce({
      email: "off@example.com",
      resolvedUserId: "off",
      status: "active",
      settings: { notifications: { studioCourseEmail: false } },
    });
    mockSesSend.mockResolvedValue({});

    const summary = await sendMailToParticipantUserIds(client, {
      participantsTable: "participants",
      sesSourceEmail: "studio@example.com",
      tenantId: "t1",
      participantUserIds: ["off"],
      buildMail: () => ({ subject: "Hi", html: "<p>Hi</p>" }),
    });

    expect(summary.mailSentCount).toBe(1);
    expect(summary.mailSkippedOptOutCount).toBe(0);
  });
});
