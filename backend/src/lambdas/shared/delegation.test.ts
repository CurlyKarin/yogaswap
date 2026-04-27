import { ensureDelegatedActionAllowed } from "./delegation";

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
