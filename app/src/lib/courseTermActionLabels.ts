import { formatCourseIsoDateDe } from "shared/courseStatus";
import type { Course, Swap } from "shared/types";

export function courseTermActionLabel(
  courseName: string,
  action: string,
  termIso: string,
  extras: string[] = [],
): string {
  return [action, courseName, formatCourseIsoDateDe(termIso), ...extras].join(", ");
}

export function formatSwapStatusLine(swap: Swap, courseId: number, allCourses: Course[]): string {
  const courseName = (id: number) => allCourses.find((c) => c.id === id)?.name ?? "Kurs";
  if (swap.status === "pending" && swap.fromCourseId === courseId) {
    return `Tauschanfrage für ${formatCourseIsoDateDe(swap.toDate)} · ${courseName(swap.toCourseId)}`;
  }
  if (swap.status === "pending" && swap.toCourseId === courseId) {
    return `Tauschanfrage zu ${formatCourseIsoDateDe(swap.fromDate)} · ${courseName(swap.fromCourseId)}`;
  }
  if (swap.fromCourseId === courseId) {
    return `Getauscht mit ${formatCourseIsoDateDe(swap.toDate)} · ${courseName(swap.toCourseId)}`;
  }
  return `Getauscht von ${formatCourseIsoDateDe(swap.fromDate)} · ${courseName(swap.fromCourseId)}`;
}

export function swapTermIsoForCourse(swap: Swap, courseId: number): string {
  return swap.fromCourseId === courseId ? swap.fromDate : swap.toDate;
}
