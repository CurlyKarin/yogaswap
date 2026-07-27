import { formatSesFromAddress, resolveSesSourceEmail } from "./sesFromAddress";

describe("formatSesFromAddress", () => {
  it("wraps bare addresses with YogaSwap display name", () => {
    expect(formatSesFromAddress("noreply@yogaswap.de")).toBe("YogaSwap <noreply@yogaswap.de>");
  });

  it("leaves already formatted From values unchanged", () => {
    expect(formatSesFromAddress("YogaSwap <noreply@yogaswap.de>")).toBe(
      "YogaSwap <noreply@yogaswap.de>",
    );
  });

  it("returns empty/whitespace as empty after trim", () => {
    expect(formatSesFromAddress("  ")).toBe("");
  });
});

describe("resolveSesSourceEmail", () => {
  const prev = process.env.SES_SOURCE_EMAIL;

  afterEach(() => {
    if (prev === undefined) delete process.env.SES_SOURCE_EMAIL;
    else process.env.SES_SOURCE_EMAIL = prev;
  });

  it("formats env value", () => {
    process.env.SES_SOURCE_EMAIL = "noreply@yogaswap.de";
    expect(resolveSesSourceEmail()).toBe("YogaSwap <noreply@yogaswap.de>");
  });
});
