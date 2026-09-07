import { describe, expect, it } from "vitest";
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  isValidNickname,
  validateNickname,
} from "shared/nickname";

describe("validateNickname (#326)", () => {
  it("accepts allowed nicknames", () => {
    for (const value of ["Max", "kai", "Anna.M", "Bjoern", "a_b-c.1", "Abc"]) {
      const result = validateNickname(value);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.nickname).toBe(value.trim());
    }
  });

  it("trims whitespace before validating", () => {
    const result = validateNickname("  Max  ");
    expect(result).toEqual({ ok: true, nickname: "Max" });
  });

  it("rejects empty and too short", () => {
    expect(validateNickname("")).toMatchObject({ ok: false, code: "empty" });
    expect(validateNickname("   ")).toMatchObject({ ok: false, code: "empty" });
    expect(validateNickname("ab")).toMatchObject({ ok: false, code: "too_short" });
    expect(validateNickname("ab").ok).toBe(false);
    expect(NICKNAME_MIN_LENGTH).toBe(3);
  });

  it("rejects too long", () => {
    const long = "a".repeat(NICKNAME_MAX_LENGTH + 1);
    expect(validateNickname(long)).toMatchObject({ ok: false, code: "too_long" });
    expect(validateNickname("a".repeat(NICKNAME_MAX_LENGTH)).ok).toBe(true);
  });

  it("rejects umlauts and ß with dedicated message", () => {
    for (const value of ["Björn", "Müller", "Großer", "Änne"]) {
      const result = validateNickname(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("umlauts");
        expect(result.message).toMatch(/Umlaute/i);
      }
    }
  });

  it("rejects #, spaces and other invalid chars", () => {
    expect(validateNickname("Max#1")).toMatchObject({ ok: false, code: "invalid_chars" });
    expect(validateNickname("a b")).toMatchObject({ ok: false, code: "invalid_chars" });
    expect(validateNickname("Max!")).toMatchObject({ ok: false, code: "invalid_chars" });
    expect(validateNickname("Max@home")).toMatchObject({ ok: false, code: "invalid_chars" });
  });

  it("isValidNickname mirrors ok flag", () => {
    expect(isValidNickname("Max")).toBe(true);
    expect(isValidNickname("Björn")).toBe(false);
  });
});
