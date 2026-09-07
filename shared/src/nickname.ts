/** Nickname rules for operative refs (#326). Display names → #327. */

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 32;

/** Allowed after trim: ASCII letters, digits, `.`, `-`, `_`. No `#`, spaces, umlauts. */
export const NICKNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/** Detects letters outside basic Latin (Umlaute, ß, accents, …). */
const NON_ASCII_LETTER = /[^\u0000-\u007f]/u;

export type NicknameValidationCode =
  | "empty"
  | "too_short"
  | "too_long"
  | "umlauts"
  | "invalid_chars";

export type NicknameValidationResult =
  | { ok: true; nickname: string }
  | { ok: false; code: NicknameValidationCode; message: string };

const MESSAGES: Record<NicknameValidationCode, string> = {
  empty: "Bitte einen Nickname eingeben.",
  too_short: `Bitte mindestens ${NICKNAME_MIN_LENGTH} Zeichen für den Nickname eingeben.`,
  too_long: `Nickname darf höchstens ${NICKNAME_MAX_LENGTH} Zeichen lang sein.`,
  umlauts:
    "Bitte Nickname ohne Umlaute und Sonderbuchstaben (z. B. Bjoern statt Björn). Anzeigename folgt separat.",
  invalid_chars:
    "Nickname darf nur Buchstaben (a–z), Ziffern sowie . - _ enthalten (kein Leerzeichen, kein #).",
};

export function nicknameValidationMessage(code: NicknameValidationCode): string {
  return MESSAGES[code];
}

/**
 * Validates and trims a nickname for storage / invite.
 * Does not check tenant uniqueness (case-insensitive) — that stays in createParticipants / Admin UI.
 */
export function validateNickname(raw: string | null | undefined): NicknameValidationResult {
  const nickname = typeof raw === "string" ? raw.trim() : "";
  if (!nickname) {
    return { ok: false, code: "empty", message: MESSAGES.empty };
  }
  if (nickname.length < NICKNAME_MIN_LENGTH) {
    return { ok: false, code: "too_short", message: MESSAGES.too_short };
  }
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, code: "too_long", message: MESSAGES.too_long };
  }
  if (NON_ASCII_LETTER.test(nickname)) {
    return { ok: false, code: "umlauts", message: MESSAGES.umlauts };
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return { ok: false, code: "invalid_chars", message: MESSAGES.invalid_chars };
  }
  return { ok: true, nickname };
}

export function isValidNickname(raw: string | null | undefined): boolean {
  return validateNickname(raw).ok;
}
