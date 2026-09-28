import { courseBlockEndIso, isBoundedSeriesPlanningMode } from "shared/courseStatus";
import { resolveRollingPlanningHorizonWeeks } from "shared/tenantSettings";
import type { Course, TenantSettings } from "shared/types";
import { WEEKDAY_INDEX } from "./courseSchedule";
import { addWeeks, startOfWeekMonday } from "./courseWeek";

/** Vordere Kappe der Wochenansicht (#330): ~1 Jahr, unabhängig vom Admin-Planungsdialog (156). */
export const WEEK_VIEW_FORWARD_HORIZON_WEEKS = 52;

function toLocalDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnlyUtc(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Ende des Teilnehmer-Sichtfensters für Rollkurse (UTC-Datum, inklusiv),
 * analog zu `deriveVisibleDates`. Sonst `null` (kein Studio-Fenster).
 */
export function rollingParticipantVisibilityEndIso(
  course: Pick<Course, "planningMode" | "plannedEndDate">,
  settings: TenantSettings | undefined,
  now: Date = new Date(),
): string | null {
  if (course.planningMode !== "rolling_continuous") return null;
  const weeks = resolveRollingPlanningHorizonWeeks(settings);
  const todayUtc = startOfTodayUtc(now);
  let end = addDaysUtc(todayUtc, weeks * 7);
  const plannedEnd = parseDateOnlyUtc(course.plannedEndDate);
  if (plannedEnd && plannedEnd < end) end = plannedEnd;
  return toDateOnlyUtc(end);
}

/** Inklusives Ende der Wochen-Vorschau: heute+52w, ggf. gekürzt durch geplantes Kursende. */
export function weekViewForwardHorizonEndIso(
  course: Pick<Course, "planningMode" | "plannedEndDate" | "seriesEndDate" | "visibleUntil">,
  now: Date = new Date(),
): string {
  const todayUtc = startOfTodayUtc(now);
  let end = addDaysUtc(todayUtc, WEEK_VIEW_FORWARD_HORIZON_WEEKS * 7);

  if (course.planningMode === "rolling_continuous") {
    const plannedEnd = parseDateOnlyUtc(course.plannedEndDate);
    if (plannedEnd && plannedEnd < end) end = plannedEnd;
  } else if (isBoundedSeriesPlanningMode(course.planningMode)) {
    const blockEnd = parseDateOnlyUtc(courseBlockEndIso(course));
    if (blockEnd && blockEnd < end) end = blockEnd;
  }

  return toDateOnlyUtc(end);
}


/** Termin liegt hinter dem Teilnehmer-Sichtfenster, aber noch in der Vorschau-Kappe. */
export function isWeekViewPreviewTerm(
  course: Pick<Course, "planningMode" | "plannedEndDate" | "seriesEndDate" | "visibleUntil">,
  dateIso: string,
  settings: TenantSettings | undefined,
  now: Date = new Date(),
): boolean {
  if (course.planningMode !== "rolling_continuous") return false;
  const visibilityEnd = rollingParticipantVisibilityEndIso(course, settings, now);
  if (!visibilityEnd) return false;
  if (dateIso <= visibilityEnd) return false;
  const forwardEnd = weekViewForwardHorizonEndIso(course, now);
  return dateIso <= forwardEnd;
}

/** Wochentag des Kurses als ISO-Datum in der lokalen KW (Mo–So), sonst null. */
export function seriesWeekdayIsoInLocalWeek(
  weekStart: Date,
  weekday: string,
): string | null {
  const target = WEEKDAY_INDEX[weekday];
  if (target == null) return null;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    if (day.getDay() === target) return toLocalDateIso(day);
  }
  return null;
}

/**
 * Späteste navigierbare KW für › (#330):
 * max über Kurse von deren Vorschau-/Serienende, gekappt auf heute+52 Wochen.
 */
export function computeLatestWeekAnchor(
  courses: Course[],
  settings?: TenantSettings,
  now: Date = new Date(),
): Date {
  const todayWeek = startOfWeekMonday(now);
  const absoluteCap = startOfWeekMonday(addWeeks(todayWeek, WEEK_VIEW_FORWARD_HORIZON_WEEKS));
  let latest = todayWeek;

  for (const course of courses) {
    let endIso: string | null = null;
    if (course.planningMode === "rolling_continuous") {
      endIso = weekViewForwardHorizonEndIso(course, now);
    } else if (isBoundedSeriesPlanningMode(course.planningMode)) {
      endIso = courseBlockEndIso(course) ?? null;
    } else {
      const dates = course.dates ?? [];
      if (dates.length > 0) endIso = dates[dates.length - 1];
    }
    if (!endIso) continue;
    const endWeek = startOfWeekMonday(new Date(`${endIso}T12:00:00`));
    if (endWeek.getTime() > latest.getTime()) latest = endWeek;
  }

  if (latest.getTime() > absoluteCap.getTime()) return absoluteCap;
  return latest;
}
