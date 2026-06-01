/** Montag 00:00 (lokal) als Wochenstart — Studio-Alltag / ISO-Woche. */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addWeeks(weekStart: Date, weeks: number): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export function isSameCalendarWeek(a: Date, b: Date): boolean {
  return startOfWeekMonday(a).getTime() === startOfWeekMonday(b).getTime();
}

/** ISO-Kalenderwoche (Mo–So). */
export function getIsoWeekNumber(weekStart: Date): number {
  const thursday = new Date(weekStart);
  thursday.setDate(thursday.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function formatWeekNavLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const kw = getIsoWeekNumber(weekStart);
  const fmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const start = weekStart.toLocaleDateString("de-DE", fmt);
  const end = weekEnd.toLocaleDateString("de-DE", fmt);
  const year = weekStart.getFullYear() !== weekEnd.getFullYear() ? ` ${weekEnd.getFullYear()}` : "";
  return `KW ${kw} · ${start} – ${end}${year}`;
}

/** Wenn occurrence außerhalb von weekStart-Woche liegt → neuer weekAnchor. */
export function weekAnchorForOccurrence(occurrence: Date, currentWeekStart: Date): Date {
  if (isSameCalendarWeek(occurrence, currentWeekStart)) {
    return currentWeekStart;
  }
  return startOfWeekMonday(occurrence);
}
