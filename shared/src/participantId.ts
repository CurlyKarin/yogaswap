import { randomUUID } from "crypto";

/** UUID v4 (RFC 4122), case-insensitive Erkennung für Lookup. */
export const PARTICIPANT_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Neue stabile Mitglieds-ID pro Tenant (#317). */
export function generateParticipantId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return randomUUID();
}

export function looksLikeParticipantId(value: string): boolean {
  return PARTICIPANT_ID_REGEX.test(value.trim());
}

/** Canonical form for map keys and Dynamo comparisons. */
export function normalizeParticipantRef(value: string): string {
  return value.trim().toLowerCase();
}
