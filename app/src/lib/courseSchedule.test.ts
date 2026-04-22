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
});
