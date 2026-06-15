import { startOfWeekMonday } from "./courseWeek";

export const WEEK_ANCHOR_STORAGE_PREFIX = "yogaswap.weekAnchor";

export function buildWeekAnchorStorageKey(tenantId: string, userId: string): string {
  return `${WEEK_ANCHOR_STORAGE_PREFIX}:${tenantId}:${userId}`;
}

function toLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function readStoredWeekAnchor(storageKey: string): Date | null {
  if (typeof sessionStorage === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = parseLocalDateIso(raw);
    if (!parsed) return null;
    return startOfWeekMonday(parsed);
  } catch {
    return null;
  }
}

export function writeStoredWeekAnchor(storageKey: string, weekAnchor: Date): void {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.setItem(storageKey, toLocalDateIso(startOfWeekMonday(weekAnchor)));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clampWeekAnchor(weekAnchor: Date, earliestWeekAnchor: Date): Date {
  const normalized = startOfWeekMonday(weekAnchor);
  const earliest = startOfWeekMonday(earliestWeekAnchor);
  if (normalized.getTime() < earliest.getTime()) {
    return earliest;
  }
  return normalized;
}

export function resolveInitialWeekAnchor(
  storageKey: string,
  earliestWeekAnchor: Date,
): Date {
  const stored = readStoredWeekAnchor(storageKey);
  const fallback = startOfWeekMonday(new Date());
  return clampWeekAnchor(stored ?? fallback, earliestWeekAnchor);
}
