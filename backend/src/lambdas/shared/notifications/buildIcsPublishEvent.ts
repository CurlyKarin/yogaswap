import { buildCourseOccurrenceLocal } from "../courseDates";

const DEFAULT_DURATION_MINUTES = 90; // Follow-up: pro Kurs in Kurseinstellungen (#239)

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIcsLocalDateTime(date: Date): string {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

function formatIcsUtcDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export type IcsPublishEventInput = {
  uid: string;
  summary: string;
  description?: string;
  isoDate: string;
  time: string;
  durationMinutes?: number;
};

export function buildIcsPublishEvent(input: IcsPublishEventInput): string | null {
  const start = buildCourseOccurrenceLocal(input.isoDate, input.time);
  if (!start) return null;

  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YogaSwap//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${formatIcsUtcDateTime(now)}`,
    `DTSTART:${formatIcsLocalDateTime(start)}`,
    `DTEND:${formatIcsLocalDateTime(end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  ];

  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description.trim())}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
