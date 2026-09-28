import { describe, expect, it } from "vitest";
import type { Course } from "shared/types";
import { startOfWeekMonday, addWeeks } from "./courseWeek";
import {
  WEEK_VIEW_FORWARD_HORIZON_WEEKS,
  computeLatestWeekAnchor,
  isWeekViewPreviewTerm,
  rollingParticipantVisibilityEndIso,
  seriesWeekdayIsoInLocalWeek,
  weekViewForwardHorizonEndIso,
} from "./weekViewPreview";

const rollingCourse: Course = {
  id: 1,
  name: "Flow",
  weekday: "Mon",
  time: "10:00",
  capacity: 10,
  participants: [],
  planningMode: "rolling_continuous",
  dates: ["2026-06-01", "2026-06-08"],
  excludedDates: [],
};

describe("weekViewPreview", () => {
  const now = new Date(Date.UTC(2026, 5, 1, 12, 0, 0)); // 1.6.2026

  it("visibility end follows studio horizon weeks", () => {
    expect(
      rollingParticipantVisibilityEndIso(rollingCourse, { rollingPlanningHorizonWeeks: 5 }, now),
    ).toBe("2026-07-06");
  });

  it("forward horizon is 52 weeks, capped by plannedEndDate", () => {
    expect(weekViewForwardHorizonEndIso(rollingCourse, now)).toBe("2027-05-31");
    expect(
      weekViewForwardHorizonEndIso(
        { ...rollingCourse, plannedEndDate: "2026-09-01" },
        now,
      ),
    ).toBe("2026-09-01");
  });

  it("marks terms after visibility window as preview", () => {
    expect(
      isWeekViewPreviewTerm(rollingCourse, "2026-06-08", { rollingPlanningHorizonWeeks: 5 }, now),
    ).toBe(false);
    expect(
      isWeekViewPreviewTerm(rollingCourse, "2026-08-03", { rollingPlanningHorizonWeeks: 5 }, now),
    ).toBe(true);
  });

  it("does not mark bounded series terms as preview", () => {
    expect(
      isWeekViewPreviewTerm(
        {
          ...rollingCourse,
          planningMode: "bounded_series",
          seriesEndDate: "2026-12-31",
        },
        "2026-11-02",
        { rollingPlanningHorizonWeeks: 5 },
        now,
      ),
    ).toBe(false);
  });

  it("resolves series weekday iso in a local week", () => {
    const weekStart = new Date(2026, 5, 1); // Mo 1.6.2026 local
    expect(seriesWeekdayIsoInLocalWeek(weekStart, "Mon")).toBe("2026-06-01");
    expect(seriesWeekdayIsoInLocalWeek(weekStart, "Wed")).toBe("2026-06-03");
  });

  it("computeLatestWeekAnchor caps at 52 weeks from today", () => {
    const latest = computeLatestWeekAnchor([rollingCourse], undefined, now);
    const expected = startOfWeekMonday(addWeeks(startOfWeekMonday(now), WEEK_VIEW_FORWARD_HORIZON_WEEKS));
    expect(latest.getTime()).toBe(expected.getTime());
  });

  it("computeLatestWeekAnchor uses full forward cap when course list is empty", () => {
    const latest = computeLatestWeekAnchor([], undefined, now);
    const expected = startOfWeekMonday(addWeeks(startOfWeekMonday(now), WEEK_VIEW_FORWARD_HORIZON_WEEKS));
    expect(latest.getTime()).toBe(expected.getTime());
  });

  it("computeLatestWeekAnchor respects earlier planned end", () => {
    const latest = computeLatestWeekAnchor(
      [{ ...rollingCourse, plannedEndDate: "2026-07-15" }],
      undefined,
      now,
    );
    expect(latest.getTime()).toBe(startOfWeekMonday(new Date("2026-07-15T12:00:00")).getTime());
  });
});
