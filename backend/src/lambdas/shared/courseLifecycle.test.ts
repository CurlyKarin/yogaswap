import {
  hasBlockingUpcomingCourseDates,
  overrideBlocksCourseLifecycle,
} from "./courseLifecycle";

describe("courseLifecycle", () => {
  test("overrideBlocksCourseLifecycle ignores stale participants when course is empty", () => {
    const now = new Date("2026-05-19T12:00:00");
    const item = {
      date: { S: "2026-05-20" },
      participants: { L: [{ S: "luna" }] },
    };
    expect(overrideBlocksCourseLifecycle(item, now, false)).toBe(false);
  });

  test("overrideBlocksCourseLifecycle blocks waitlist on future date for empty course", () => {
    const now = new Date("2026-05-19T12:00:00");
    const item = {
      date: { S: "2026-05-20" },
      waitlist: { L: [{ S: "luna" }] },
    };
    expect(overrideBlocksCourseLifecycle(item, now, false)).toBe(true);
  });

  test("hasBlockingUpcomingCourseDates uses date+time when course has participants", () => {
    const dates = ["2026-05-19"];
    const before = new Date(2026, 4, 19, 8, 0, 0);
    const after = new Date(2026, 4, 19, 10, 0, 0);
    expect(hasBlockingUpcomingCourseDates(dates, "09:00", before, true)).toBe(true);
    expect(hasBlockingUpcomingCourseDates(dates, "09:00", after, true)).toBe(false);
    expect(hasBlockingUpcomingCourseDates(dates, "09:00", before, false)).toBe(false);
  });
});
