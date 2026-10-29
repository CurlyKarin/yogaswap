import { describe, expect, it } from "vitest";
import { isLayoutDebugEnabled } from "./layoutDebugFlag";

describe("isLayoutDebugEnabled", () => {
  it("is true on staging hosts", () => {
    expect(
      isLayoutDebugEnabled({
        hostname: "staging.yogaswap.de",
        search: "",
        dev: false,
        envFlag: "",
        mode: "production",
      }),
    ).toBe(true);
  });

  it("is true with ?layoutDebug=1", () => {
    expect(
      isLayoutDebugEnabled({
        hostname: "app.yogaswap.de",
        search: "?layoutDebug=1",
        dev: false,
        envFlag: "",
        mode: "production",
      }),
    ).toBe(true);
  });

  it("is false on production without flag", () => {
    expect(
      isLayoutDebugEnabled({
        hostname: "app.yogaswap.de",
        search: "",
        dev: false,
        envFlag: "",
        mode: "production",
      }),
    ).toBe(false);
  });

  it("is true in DEV", () => {
    expect(
      isLayoutDebugEnabled({
        hostname: "app.yogaswap.de",
        search: "",
        dev: true,
        envFlag: "",
        mode: "development",
      }),
    ).toBe(true);
  });

  it("is false in Vitest mode even on staging", () => {
    expect(
      isLayoutDebugEnabled({
        hostname: "staging.yogaswap.de",
        search: "?layoutDebug=1",
        envFlag: "1",
        mode: "test",
      }),
    ).toBe(false);
  });
});
