import { buildCourseOccurrenceLocal } from "shared/courseStatus";
import type { Swap } from "shared/types";
import type { ParticipantActor } from "shared/participantActor";
import { isPersonallyInvolvedInCourse } from "./weekMyCoursesFilter";
import type { WeekCourseRow } from "./courseWeekOccurrences";

/** Align with ICS default until per-course duration exists (#239). */
export const DEFAULT_COURSE_DURATION_MINUTES = 90;

export type TodayFocusTarget = {
  courseId: number;
  dateIso: string;
};

type RankedOccurrence = {
  courseId: number;
  dateIso: string;
  startMs: number;
  endMs: number;
  involved: boolean;
};

function compareRunningCandidates(a: RankedOccurrence, b: RankedOccurrence): number {
  if (a.involved !== b.involved) return a.involved ? -1 : 1;
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  return a.courseId - b.courseId;
}

function compareUpcomingCandidates(a: RankedOccurrence, b: RankedOccurrence): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.involved !== b.involved) return a.involved ? -1 : 1;
  return a.courseId - b.courseId;
}

function collectScheduledOccurrences(
  rows: WeekCourseRow[],
  actor: ParticipantActor,
  swaps: Swap[],
  durationMinutes: number,
): RankedOccurrence[] {
  const result: RankedOccurrence[] = [];
  for (const { course, occurrences } of rows) {
    const involved = isPersonallyInvolvedInCourse(course, actor, swaps);
    for (const occurrence of occurrences) {
      if (occurrence.kind !== "scheduled") continue;
      const start = buildCourseOccurrenceLocal(occurrence.dateIso, course.time);
      if (!start) continue;
      const startMs = start.getTime();
      result.push({
        courseId: course.id,
        dateIso: occurrence.dateIso,
        startMs,
        endMs: startMs + durationMinutes * 60 * 1000,
        involved,
      });
    }
  }
  return result;
}

/**
 * Pick the week-view card „Heute“ should focus among currently visible rows:
 * 1. currently running (start ≤ now < start + duration) — involvement as tie-break
 * 2. else next upcoming start this week (chronological; involvement only at equal start)
 *
 * Operates on currently visible rows so „nur meine Kurse“ vs „alle Kurse“ stays as-is.
 * With „alle Kurse“, jumping to the studio’s running class supports the overview use case.
 */
export function pickTodayFocusTarget(
  rows: WeekCourseRow[],
  actor: ParticipantActor,
  swaps: Swap[],
  now: Date = new Date(),
  durationMinutes: number = DEFAULT_COURSE_DURATION_MINUTES,
): TodayFocusTarget | null {
  const nowMs = now.getTime();
  const candidates = collectScheduledOccurrences(rows, actor, swaps, durationMinutes);
  if (candidates.length === 0) return null;

  const running = candidates.filter((c) => c.startMs <= nowMs && nowMs < c.endMs);
  if (running.length > 0) {
    running.sort(compareRunningCandidates);
    const best = running[0];
    return { courseId: best.courseId, dateIso: best.dateIso };
  }

  const upcoming = candidates.filter((c) => c.startMs >= nowMs);
  if (upcoming.length === 0) return null;
  upcoming.sort(compareUpcomingCandidates);
  const best = upcoming[0];
  return { courseId: best.courseId, dateIso: best.dateIso };
}
