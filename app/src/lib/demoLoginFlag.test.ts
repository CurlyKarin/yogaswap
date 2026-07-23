import { describe, expect, it, vi, afterEach } from "vitest";

describe("isDemoLoginEnabled (#100)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("is true only when VITE_SHOW_DEMO_LOGIN is the string true", async () => {
    vi.stubEnv("VITE_SHOW_DEMO_LOGIN", "true");
    const { isDemoLoginEnabled } = await import("./demoLoginFlag");
    expect(isDemoLoginEnabled()).toBe(true);
  });

  it("is false when unset or any other value", async () => {
    vi.stubEnv("VITE_SHOW_DEMO_LOGIN", "false");
    const off = await import("./demoLoginFlag");
    expect(off.isDemoLoginEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv("VITE_SHOW_DEMO_LOGIN", "");
    const empty = await import("./demoLoginFlag");
    expect(empty.isDemoLoginEnabled()).toBe(false);
  });
});
