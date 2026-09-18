import { invalidateAuthTokensForUser } from "./invalidateAuthTokens";

describe("invalidateAuthTokensForUser", () => {
  const send = jest.fn();
  const client = { send } as any;

  beforeEach(() => {
    send.mockReset();
  });

  test("marks unused tokens for the user as used", async () => {
    send
      .mockResolvedValueOnce({
        Items: [
          { token: { S: "tok-a" }, userId: { S: "alice" } },
          { token: { S: "tok-b" }, userId: { S: "alice" } },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const count = await invalidateAuthTokensForUser({
      client,
      authTokensTable: "auth-tokens",
      tenantId: "tenant-1",
      userId: "alice",
      nowSeconds: 1_700_000_000,
    });

    expect(count).toBe(2);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        TableName: "auth-tokens",
        KeyConditionExpression: "tenantId = :tid",
        FilterExpression: "userId = :uid AND attribute_not_exists(usedAt)",
      }),
    );
    expect(send.mock.calls[1][0].input).toEqual(
      expect.objectContaining({
        Key: { tenantId: { S: "tenant-1" }, token: { S: "tok-a" } },
        UpdateExpression: "SET usedAt = :now",
        ConditionExpression: "attribute_not_exists(usedAt)",
      }),
    );
  });

  test("skips tokens that race to usedAt (ConditionalCheckFailedException)", async () => {
    send
      .mockResolvedValueOnce({
        Items: [{ token: { S: "tok-a" }, userId: { S: "alice" } }],
      })
      .mockRejectedValueOnce({ name: "ConditionalCheckFailedException" });

    const count = await invalidateAuthTokensForUser({
      client,
      authTokensTable: "auth-tokens",
      tenantId: "tenant-1",
      userId: "alice",
    });

    expect(count).toBe(0);
  });

  test("returns 0 for empty userId", async () => {
    const count = await invalidateAuthTokensForUser({
      client,
      authTokensTable: "auth-tokens",
      tenantId: "tenant-1",
      userId: "  ",
    });
    expect(count).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
