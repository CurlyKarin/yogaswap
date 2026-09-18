import {
  deleteCognitoUserBestEffort,
  hasCompletedInviteForPoolUser,
} from "./deleteIncompleteCognitoUser";

describe("deleteCognitoUserBestEffort", () => {
  const send = jest.fn();
  const cognito = { send } as any;

  beforeEach(() => {
    send.mockReset();
  });

  test("deletes by stored cognitoUsername", async () => {
    send.mockResolvedValueOnce({});
    const ok = await deleteCognitoUserBestEffort({
      cognito,
      userPoolId: "pool",
      cognitoUsername: "opaque-alice",
      userId: "alice",
    });
    expect(ok).toBe(true);
    expect(send.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        UserPoolId: "pool",
        Username: "opaque-alice",
      }),
    );
  });

  test("falls back to userId when cognitoUsername missing", async () => {
    send.mockResolvedValueOnce({});
    await deleteCognitoUserBestEffort({
      cognito,
      userPoolId: "pool",
      userId: "alice",
    });
    expect(send.mock.calls[0][0].input.Username).toBe("alice");
  });

  test("returns false on UserNotFoundException", async () => {
    send.mockRejectedValueOnce({ name: "UserNotFoundException" });
    const ok = await deleteCognitoUserBestEffort({
      cognito,
      userPoolId: "pool",
      userId: "alice",
    });
    expect(ok).toBe(false);
  });
});

describe("hasCompletedInviteForPoolUser", () => {
  const send = jest.fn();
  const client = { send } as any;

  beforeEach(() => {
    send.mockReset();
  });

  test("returns true when a profile has inviteCompletedAt", async () => {
    send.mockResolvedValueOnce({
      Items: [{ tenantId: { S: "t1" }, userId: { S: "alice" } }],
    });
    const ok = await hasCompletedInviteForPoolUser({
      client,
      participantsTable: "participants",
      cognitoUsername: "opaque",
      authUserId: "sub-1",
    });
    expect(ok).toBe(true);
    expect(send.mock.calls[0][0].input.FilterExpression).toContain("inviteCompletedAt");
  });

  test("returns false when scan finds nothing", async () => {
    send.mockResolvedValueOnce({ Items: [] });
    const ok = await hasCompletedInviteForPoolUser({
      client,
      participantsTable: "participants",
      cognitoUsername: "opaque",
    });
    expect(ok).toBe(false);
  });
});
