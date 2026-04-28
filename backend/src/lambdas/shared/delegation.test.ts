import { ensureDelegatedActionAllowed, getDelegationErrorResponse } from "./delegation";

describe("ensureDelegatedActionAllowed", () => {
  it("erlaubt reguläre Aktionen ohne actingFor", () => {
    const result = ensureDelegatedActionAllowed({
      action: "create_swap",
      actorUserId: "admin",
    });
    expect(result).toEqual({ ok: true });
  });

  it("blockiert Delegation ohne actor", () => {
    const result = ensureDelegatedActionAllowed({
      action: "create_swap",
      actingForUserId: "target",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(403);
    }
  });

  it("blockiert actingFor == actor", () => {
    const result = ensureDelegatedActionAllowed({
      action: "create_swap",
      actorUserId: "maya",
      actingForUserId: "Maya",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(400);
    }
  });
});

describe("getDelegationErrorResponse", () => {
  it("gibt null zurueck wenn Delegation erlaubt ist", () => {
    const response = getDelegationErrorResponse({
      action: "create_swap",
      actorUserId: "admin",
    });
    expect(response).toBeNull();
  });

  it("gibt standardisierte Fehlerantwort zurueck wenn Delegation blockiert wird", () => {
    const response = getDelegationErrorResponse({
      action: "create_swap",
      actingForUserId: "target",
    });
    expect(response).toEqual({
      statusCode: 403,
      body: JSON.stringify({ error: "Delegation requires authenticated actor user." }),
    });
  });
});
