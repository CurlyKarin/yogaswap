import {
  computeCourseReconcile,
  dateListsEqual,
  resolveEffectiveCourseStatus,
} from "./courseReconcile";

describe("courseReconcile", () => {
  const pastOnly = ["2020-01-06", "2020-01-13"];
  const future = ["2099-06-02"];

  test("auto-inactivates active bounded_series without future visible dates", () => {
    expect(
      resolveEffectiveCourseStatus("active", "bounded_series", pastOnly, new Date("2026-05-18")),
    ).toBe("inactive");
  });

  test("keeps active when future visible dates exist", () => {
    expect(
      resolveEffectiveCourseStatus("active", "bounded_series", future, new Date("2026-05-18")),
    ).toBe("active");
  });

  test("does not change draft or inactive status", () => {
    expect(resolveEffectiveCourseStatus("draft", "bounded_series", pastOnly)).toBe("draft");
    expect(resolveEffectiveCourseStatus("inactive", "bounded_series", future)).toBe("inactive");
  });

  test("computeCourseReconcile flags persist when status or dates drift", () => {
    const statusOnly = computeCourseReconcile({
      storedStatus: "active",
      planningMode: "bounded_series",
      visibleDates: pastOnly,
      storedDates: pastOnly,
      now: new Date("2026-05-18"),
    });
    expect(statusOnly.shouldPersist).toBe(true);
    expect(statusOnly.statusChanged).toBe(true);
    expect(statusOnly.datesChanged).toBe(false);

    const datesOnly = computeCourseReconcile({
      storedStatus: "active",
      planningMode: "rolling_continuous",
      visibleDates: future,
      storedDates: pastOnly,
      now: new Date("2026-05-18"),
    });
    expect(datesOnly.shouldPersist).toBe(true);
    expect(datesOnly.statusChanged).toBe(false);
    expect(datesOnly.datesChanged).toBe(true);

    const noop = computeCourseReconcile({
      storedStatus: "active",
      planningMode: "bounded_series",
      visibleDates: future,
      storedDates: future,
      now: new Date("2026-05-18"),
    });
    expect(noop.shouldPersist).toBe(false);
  });

  test("dateListsEqual ignores order", () => {
    expect(dateListsEqual(["2026-01-02", "2026-01-01"], ["2026-01-01", "2026-01-02"])).toBe(true);
  });
});
