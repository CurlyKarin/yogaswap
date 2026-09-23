import { hasOtherStudioParticipantPresence } from "./otherStudioPresence";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    ScanCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("hasOtherStudioParticipantPresence", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns false without identity keys", async () => {
    const ok = await hasOtherStudioParticipantPresence({
      client: { send: mockSend } as never,
      participantsTable: "p",
      tenantId: "t1",
    });
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns true when scan finds another tenant profile", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ tenantId: { S: "t2" }, userId: { S: "alice" } }],
    });
    const ok = await hasOtherStudioParticipantPresence({
      client: { send: mockSend } as never,
      participantsTable: "p",
      tenantId: "t1",
      authUserId: "sub-1",
    });
    expect(ok).toBe(true);
  });

  it("returns false when scan empty", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const ok = await hasOtherStudioParticipantPresence({
      client: { send: mockSend } as never,
      participantsTable: "p",
      tenantId: "t1",
      cognitoUsername: "opaque-1",
    });
    expect(ok).toBe(false);
  });
});
