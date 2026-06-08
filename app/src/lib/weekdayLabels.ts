const WEEKDAY_LABELS_DE: Record<string, string> = {
  Sun: "Sonntag",
  Sunday: "Sonntag",
  Mon: "Montag",
  Monday: "Montag",
  Tue: "Dienstag",
  Tuesday: "Dienstag",
  Wed: "Mittwoch",
  Wednesday: "Mittwoch",
  Thu: "Donnerstag",
  Thursday: "Donnerstag",
  Fri: "Freitag",
  Friday: "Freitag",
  Sat: "Samstag",
  Saturday: "Samstag",
};

/** Deutsche Vollform für gespeicherte Wochentags-Codes (Mon, Monday, …). */
export function weekdayLabelDe(weekday: string): string {
  return WEEKDAY_LABELS_DE[weekday] ?? weekday;
}

export const WEEKDAY_OPTIONS = [
  { value: "Mon", label: "Montag" },
  { value: "Tue", label: "Dienstag" },
  { value: "Wed", label: "Mittwoch" },
  { value: "Thu", label: "Donnerstag" },
  { value: "Fri", label: "Freitag" },
  { value: "Sat", label: "Samstag" },
  { value: "Sun", label: "Sonntag" },
] as const;
