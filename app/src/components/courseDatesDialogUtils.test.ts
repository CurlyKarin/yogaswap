import { describe, expect, it } from "vitest";
import type { Course } from "shared/types";
import {
  buildSeriesCalendarCells,
  createDatesState,
  isCourseBlockReplanContext,
  toMonthKey,
} from "./courseDatesDialogUtils";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    tenantId: "default-tenant",
    id: 1,
    name: "Block",
    weekday: "Mon",
    time: "10:00",
    capacity: 10,
    status: "draft",
    planningMode: "bounded_series",
    seriesStartDate: "2025-09-01",
    seriesEndDate: "2025-12-15",
    excludedDates: ["2025-10-06", "2025-12-01"],
    participants: ["luna"],
    dates: ["2025-09-01"],
    ...overrides,
  };
}

describe("isCourseBlockReplanContext", () => {
  const now = new Date(2026, 8, 29, 12, 0, 0); // 29.09.2026 local

  it("is true for draft with replanPending", () => {
    expect(
      isCourseBlockReplanContext(
        makeCourse({
          seriesStartDate: "2026-09-01",
          seriesEndDate: "2026-10-31",
          replanPending: true,
        }),
        now,
      ),
    ).toBe(true);
  });

  it("is true for draft bounded series with end in the past", () => {
    expect(isCourseBlockReplanContext(makeCourse(), now)).toBe(true);
  });

  it("is false when series already started but no flag and end still future", () => {
    expect(
      isCourseBlockReplanContext(
        makeCourse({
          seriesStartDate: "2026-09-01",
          seriesEndDate: "2026-10-31",
          dates: ["2026-09-01"],
        }),
        now,
      ),
    ).toBe(false);
  });

  it("is false for active courses even with replanPending", () => {
    expect(
      isCourseBlockReplanContext(makeCourse({ status: "active", replanPending: true }), now),
    ).toBe(false);
  });

  it("is false for rolling courses", () => {
    expect(
      isCourseBlockReplanContext(
        makeCourse({ planningMode: "rolling_continuous", seriesEndDate: undefined }),
        now,
      ),
    ).toBe(false);
  });

  it("is false when series has not ended and no flag", () => {
    expect(
      isCourseBlockReplanContext(
        makeCourse({ seriesStartDate: "2026-10-01", seriesEndDate: "2026-12-31" }),
        now,
      ),
    ).toBe(false);
  });
});

describe("createDatesState replan (#331)", () => {
  const now = new Date(2026, 8, 29, 12, 0, 0);

  it("clears range and exclusions and opens on current month", () => {
    const state = createDatesState(makeCourse({ replanPending: true }), now);
    const currentMonth = toMonthKey(new Date(Date.UTC(2026, 8, 29, 12)));
    expect(state.replanMode).toBe(true);
    expect(state.replanExclusionsCleared).toBe(true);
    expect(state.seriesStartDate).toBe("");
    expect(state.seriesEndDate).toBe("");
    expect(state.excludedDates).toEqual([]);
    expect(state.rangeCalendarMonth).toBe(currentMonth);
    expect(state.excludedCalendarMonth).toBe(currentMonth);
  });

  it("clears when replanPending even if series end is still future", () => {
    const state = createDatesState(
      makeCourse({
        seriesStartDate: "2026-09-01",
        seriesEndDate: "2026-10-31",
        excludedDates: ["2026-09-15"],
        dates: ["2026-09-01", "2026-09-08"],
        replanPending: true,
      }),
      now,
    );
    expect(state.replanMode).toBe(true);
    expect(state.seriesStartDate).toBe("");
    expect(state.excludedDates).toEqual([]);
  });

  it("keeps draft range for first-time planning with start already in the past", () => {
    const state = createDatesState(
      makeCourse({
        seriesStartDate: "2026-09-01",
        seriesEndDate: "2026-10-31",
        excludedDates: ["2026-09-15"],
        dates: ["2026-09-01"],
      }),
      now,
    );
    expect(state.replanMode).toBeUndefined();
    expect(state.seriesStartDate).toBe("2026-09-01");
    expect(state.seriesEndDate).toBe("2026-10-31");
    expect(state.excludedDates).toEqual(["2026-09-15"]);
  });

  it("keeps mid-season draft range when series has not ended and no flag", () => {
    const state = createDatesState(
      makeCourse({
        seriesStartDate: "2026-10-01",
        seriesEndDate: "2026-12-31",
        excludedDates: ["2026-11-02"],
      }),
      now,
    );
    expect(state.replanMode).toBeUndefined();
    expect(state.seriesStartDate).toBe("2026-10-01");
    expect(state.seriesEndDate).toBe("2026-12-31");
    expect(state.excludedDates).toEqual(["2026-11-02"]);
    expect(state.rangeCalendarMonth).toBe("2026-10");
  });
});

describe("buildSeriesCalendarCells without range", () => {
  it("renders month grid without treating old range as selected", () => {
    const cells = buildSeriesCalendarCells("2026-09", "Mon", "", "", []);
    expect(cells.length).toBe(42);
    expect(cells.every((cell) => !cell.inSeriesRange && !cell.isRangeStart && !cell.isRangeEnd)).toBe(
      true,
    );
  });
});
