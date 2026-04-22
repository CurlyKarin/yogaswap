import { describe, expect, it } from "vitest";
import { deriveVisibleDates } from "./courseSchedule";

describe("deriveVisibleDates", () => {
  it("derives bounded series dates within fixed window and exclusions", () => {
    const result = deriveVisibleDates({
      planningMode: "bounded_series",
      visibilityMode: "fixed_window",
      weekday: "Mon",
      seriesStartDate: "2026-01-01",
      seriesEndDate: "2026-01-31",
      visibleFrom: "2026-01-05",
      visibleUntil: "2026-01-20",
      excludedDates: ["2026-01-12"],
      includedDates: ["2026-01-14"],
      fallbackDates: [],
    });

    expect(result).toEqual(["2026-01-05", "2026-01-14", "2026-01-19"]);
  });

  it("derives rolling window dates with configured horizon", () => {
    const result = deriveVisibleDates({
      planningMode: "rolling_continuous",
      visibilityMode: "rolling_horizon",
      weekday: "Mon",
      visibilityHorizonWeeks: 2,
      excludedDates: [],
      includedDates: [],
      fallbackDates: [],
      now: new Date("2026-01-01T09:00:00.000Z"),
    });

    expect(result).toEqual(["2026-01-05", "2026-01-12"]);
  });

  it("uses UTC day boundary for rolling horizon near timezone edge", () => {
    const result = deriveVisibleDates({
      planningMode: "rolling_continuous",
      visibilityMode: "rolling_horizon",
      weekday: "Sun",
      visibilityHorizonWeeks: 1,
      excludedDates: [],
      includedDates: [],
      fallbackDates: [],
      // Local Sunday, but already Monday in UTC.
      now: new Date("2026-01-04T23:30:00-11:00"),
    });

    expect(result).toEqual(["2026-01-11"]);
  });
});
