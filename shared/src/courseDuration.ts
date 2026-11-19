/** Default course length for ICS DTEND and related displays (#239). */
export const DEFAULT_COURSE_DURATION_MINUTES = 90;
export const MIN_COURSE_DURATION_MINUTES = 15;
/** Upper bound allows day seminars (7h); not set in stone. */
export const MAX_COURSE_DURATION_MINUTES = 420;

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidCourseDurationMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_COURSE_DURATION_MINUTES &&
    value <= MAX_COURSE_DURATION_MINUTES
  );
}

/** Missing/invalid → default 90 (legacy courses without the field). */
export function resolveCourseDurationMinutes(value: unknown): number {
  if (isValidCourseDurationMinutes(value)) return value;
  return DEFAULT_COURSE_DURATION_MINUTES;
}

/**
 * Parse a form string. Empty → default. Non-integer / out of range → null.
 */
export function parseCourseDurationMinutesInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_COURSE_DURATION_MINUTES;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidCourseDurationMinutes(value) ? value : null;
}

/** Add minutes to HH:mm; wraps past midnight (e.g. 23:00 + 90 → 00:30). */
export function addMinutesToHhMm(time: string, durationMinutes: number): string | null {
  const match = HH_MM.exec(time.trim());
  if (!match || !Number.isFinite(durationMinutes)) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + Math.trunc(durationMinutes);
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Display range like `10:00 – 11:30` (en dash); falls back to start time alone. */
export function formatCourseTimeRange(
  time: string,
  durationMinutes: unknown = DEFAULT_COURSE_DURATION_MINUTES,
): string {
  const start = time.trim();
  const end = addMinutesToHhMm(start, resolveCourseDurationMinutes(durationMinutes));
  return end ? `${start} – ${end}` : start;
}
