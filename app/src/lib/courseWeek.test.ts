import { describe, expect, it } from "vitest";
import {
  addWeeks,
  formatWeekNavLabel,
  getIsoWeekNumber,
  isSameCalendarWeek,
  startOfWeekMonday,
  weekAnchorForOccurrence,
} from "./courseWeek";

describe("startOfWeekMonday", () => {
  it("returns Monday for a Wednesday", () => {
    const wed = new Date(2026, 4, 27, 15, 0, 0);
    const mon = startOfWeekMonday(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(25);
    expect(mon.getMonth()).toBe(4);
  });

  it("returns Monday of the same week for Sunday", () => {
    const sun = new Date(2026, 5, 7);
    expect(sun.getDay()).toBe(0);
    const mon = startOfWeekMonday(sun);
    expect(mon.getDate()).toBe(1);
    expect(mon.getMonth()).toBe(5);
  });
});

describe("weekAnchorForOccurrence", () => {
  it("keeps anchor when occurrence is in the same week", () => {
    const anchor = startOfWeekMonday(new Date(2026, 4, 26));
    const occurrence = new Date(2026, 4, 28);
    expect(weekAnchorForOccurrence(occurrence, anchor)).toBe(anchor);
  });

  it("jumps to occurrence week when outside current week", () => {
    const anchor = startOfWeekMonday(new Date(2026, 4, 26));
    const occurrence = new Date(2026, 5, 10);
    const next = weekAnchorForOccurrence(occurrence, anchor);
    expect(isSameCalendarWeek(next, occurrence)).toBe(true);
    expect(isSameCalendarWeek(next, anchor)).toBe(false);
  });
});

describe("formatWeekNavLabel", () => {
  it("includes KW and date range", () => {
    const label = formatWeekNavLabel(startOfWeekMonday(new Date(2026, 4, 26)));
    expect(label).toMatch(/^KW \d+ · /);
    expect(label).toContain("–");
  });
});

describe("getIsoWeekNumber", () => {
  it("matches late May 2026 sample week", () => {
    const weekStart = startOfWeekMonday(new Date(2026, 4, 26));
    expect(getIsoWeekNumber(weekStart)).toBeGreaterThan(0);
  });
});

describe("addWeeks", () => {
  it("adds seven days per week", () => {
    const start = startOfWeekMonday(new Date(2026, 4, 26));
    const next = addWeeks(start, 1);
    expect(next.getTime() - start.getTime()).toBe(7 * 86_400_000);
  });
});
