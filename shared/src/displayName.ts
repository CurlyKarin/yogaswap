/** Display name (#327) — visible label; nickname remains operational (#326). */

import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_PATTERN,
  validateNickname,
} from "./nickname";

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

/** Letters (incl. Umlaute), spaces, `.`, `-`, `'`. */
const DISPLAY_NAME_PATTERN = /^[\p{L} .'-]+$/u;
const HAS_LETTER = /\p{L}/u;
const CONTROL_OR_HASH = /[\u0000-\u001f\u007f#]/u;

export type DisplayNameValidationCode =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_chars";

export type DisplayNameValidationResult =
  | { ok: true; displayName: string }
  | { ok: false; code: DisplayNameValidationCode; message: string };

const MESSAGES: Record<DisplayNameValidationCode, string> = {
  empty: "Bitte einen Anzeigenamen eingeben.",
  too_short: `Bitte mindestens ${DISPLAY_NAME_MIN_LENGTH} Zeichen für den Anzeigenamen eingeben.`,
  too_long: `Anzeigename darf höchstens ${DISPLAY_NAME_MAX_LENGTH} Zeichen lang sein.`,
  invalid_chars:
    "Anzeigename darf Buchstaben (inkl. Umlaute), Leerzeichen sowie . - ' enthalten (kein #).",
};

export function displayNameValidationMessage(code: DisplayNameValidationCode): string {
  return MESSAGES[code];
}

/** Normalize for storage: trim, NFC, collapse internal whitespace to single spaces. */
export function normalizeDisplayNameInput(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Validates a display name for the participant profile.
 * Not unique per tenant — several people may share the same display name.
 */
export function validateDisplayName(raw: string | null | undefined): DisplayNameValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "empty", message: MESSAGES.empty };
  }
  if (CONTROL_OR_HASH.test(raw) || /[\r\n]/.test(raw)) {
    return { ok: false, code: "invalid_chars", message: MESSAGES.invalid_chars };
  }
  const displayName = normalizeDisplayNameInput(raw);
  if (!displayName) {
    return { ok: false, code: "empty", message: MESSAGES.empty };
  }
  if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
    return { ok: false, code: "too_short", message: MESSAGES.too_short };
  }
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, code: "too_long", message: MESSAGES.too_long };
  }
  if (!DISPLAY_NAME_PATTERN.test(displayName) || !HAS_LETTER.test(displayName)) {
    return { ok: false, code: "invalid_chars", message: MESSAGES.invalid_chars };
  }
  return { ok: true, displayName };
}

export function isValidDisplayName(raw: string | null | undefined): boolean {
  return validateDisplayName(raw).ok;
}

/** Visible label: displayName if set, otherwise canonical profile nickname. */
export function resolveParticipantDisplayLabel(
  profile: { displayName?: string | null; userId?: string | null },
): string {
  const displayName = profile.displayName?.trim();
  if (displayName) return displayName;
  return profile.userId?.trim() || "";
}

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

function transliterateGerman(input: string): string {
  return input.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
}

function stripCombiningMarks(input: string): string {
  return input.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

/**
 * Suggests an ASCII nickname from a display name (#327 → #326 rules).
 * Caller may pass takenNormalized (lowercased nicknames) for .2 / .3 suffixes.
 */
export function suggestNicknameFromDisplayName(
  displayName: string,
  options?: { takenNormalized?: Iterable<string> },
): string {
  const normalizedDisplay = normalizeDisplayNameInput(displayName);
  let candidate = transliterateGerman(normalizedDisplay);
  candidate = stripCombiningMarks(candidate);
  candidate = candidate.replace(/\s+/g, ".");
  candidate = candidate.replace(/[^a-zA-Z0-9._-]+/g, "");
  candidate = candidate.replace(/[._-]{2,}/g, (run) => run[0]!);
  candidate = candidate.replace(/^[._-]+|[._-]+$/g, "");

  if (candidate.length > NICKNAME_MAX_LENGTH) {
    candidate = candidate.slice(0, NICKNAME_MAX_LENGTH).replace(/[._-]+$/g, "");
  }

  if (!candidate || !NICKNAME_PATTERN.test(candidate)) {
    return candidate;
  }

  // If still shorter than min, leave as-is — validateNickname will reject; UI can edit.
  const taken = new Set(
    [...(options?.takenNormalized ?? [])].map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  if (!taken.has(candidate.toLowerCase())) {
    return candidate;
  }

  let suffix = 2;
  let attempt = candidate;
  while (taken.has(attempt.toLowerCase())) {
    const suffixText = `.${suffix}`;
    const maxBase = NICKNAME_MAX_LENGTH - suffixText.length;
    const base = candidate.slice(0, Math.max(1, maxBase)).replace(/[._-]+$/g, "");
    attempt = `${base}${suffixText}`;
    suffix += 1;
    if (suffix > 99) break;
  }
  return attempt;
}

/** True when the suggestion passes #326 nickname rules. */
export function isUsableNicknameSuggestion(nickname: string): boolean {
  return validateNickname(nickname).ok;
}
