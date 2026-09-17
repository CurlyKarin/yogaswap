import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  isUsableNicknameSuggestion,
  isValidDisplayName,
  resolveParticipantDisplayLabel,
  suggestNicknameFromDisplayName,
  validateDisplayName,
} from "shared/displayName";
import { validateNickname } from "shared/nickname";

describe("validateDisplayName (#327 / #345)", () => {
  it("accepts names with umlauts, punctuation, and digits", () => {
    for (const value of [
      "Björn",
      "Anna Müller",
      "Anna-Lena",
      "O'Brien",
      "Dr. Müller",
      "Kai",
      "Kaja2",
      "Anna 2",
    ]) {
      const result = validateDisplayName(value);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.displayName).toBe(value.trim());
    }
  });

  it("normalizes whitespace and NFC", () => {
    const result = validateDisplayName("  Anna   Müller  ");
    expect(result).toEqual({ ok: true, displayName: "Anna Müller" });
  });

  it("rejects empty, too short, too long", () => {
    expect(validateDisplayName("")).toMatchObject({ ok: false, code: "empty" });
    expect(validateDisplayName("A")).toMatchObject({ ok: false, code: "too_short" });
    expect(DISPLAY_NAME_MIN_LENGTH).toBe(2);
    const long = "A".repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    expect(validateDisplayName(long)).toMatchObject({ ok: false, code: "too_long" });
  });

  it("rejects # and digits-only content", () => {
    expect(validateDisplayName("Max#1")).toMatchObject({ ok: false, code: "invalid_chars" });
    expect(validateDisplayName("...")).toMatchObject({ ok: false, code: "invalid_chars" });
    expect(validateDisplayName("123")).toMatchObject({ ok: false, code: "invalid_chars" });
  });

  it("isValidDisplayName mirrors ok", () => {
    expect(isValidDisplayName("Kai")).toBe(true);
    expect(isValidDisplayName("Kaja2")).toBe(true);
    expect(isValidDisplayName("#")).toBe(false);
  });
});

describe("suggestNicknameFromDisplayName (#327 / #345)", () => {
  it("transliterates German umlauts", () => {
    expect(suggestNicknameFromDisplayName("Björn")).toBe("Bjoern");
    expect(suggestNicknameFromDisplayName("Anna Müller")).toBe("Anna.Mueller");
    expect(suggestNicknameFromDisplayName("Dr. Müller")).toBe("Dr.Mueller");
    expect(suggestNicknameFromDisplayName("Kai")).toBe("Kai");
  });

  it("keeps digits from display names in nickname suggestions", () => {
    expect(suggestNicknameFromDisplayName("Kaja2")).toBe("Kaja2");
    expect(suggestNicknameFromDisplayName("Anna 2")).toBe("Anna.2");
    expect(validateNickname(suggestNicknameFromDisplayName("Kaja2")).ok).toBe(true);
    expect(validateNickname(suggestNicknameFromDisplayName("Anna 2")).ok).toBe(true);
  });

  it("produces nicknames that pass #326 validation", () => {
    for (const value of ["Björn", "Anna Müller", "Dr. Müller", "Kai", "Großer", "Kaja2", "Anna 2"]) {
      const suggestion = suggestNicknameFromDisplayName(value);
      expect(validateNickname(suggestion).ok).toBe(true);
      expect(isUsableNicknameSuggestion(suggestion)).toBe(true);
    }
  });

  it("adds .2 suffix on collision", () => {
    const taken = new Set(["anna.mueller"]);
    expect(suggestNicknameFromDisplayName("Anna Müller", { takenNormalized: taken })).toBe(
      "Anna.Mueller.2",
    );
  });

  it("increments suffix until free", () => {
    const taken = new Set(["anna.mueller", "anna.mueller.2"]);
    expect(suggestNicknameFromDisplayName("Anna Müller", { takenNormalized: taken })).toBe(
      "Anna.Mueller.3",
    );
  });
});

describe("resolveParticipantDisplayLabel", () => {
  it("prefers displayName over nickname", () => {
    expect(resolveParticipantDisplayLabel({ displayName: "Björn", userId: "Bjoern" })).toBe("Björn");
  });

  it("falls back to canonical nickname", () => {
    expect(resolveParticipantDisplayLabel({ userId: "Luna" })).toBe("Luna");
    expect(resolveParticipantDisplayLabel({ displayName: "  ", userId: "Luna" })).toBe("Luna");
  });
});
