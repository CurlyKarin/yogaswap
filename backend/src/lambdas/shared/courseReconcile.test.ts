import {
  computeCourseReconcile,
  dateListsEqual,
  resolveEffectiveCourseStatus,
} from "./courseReconcile";

describe("courseReconcile", () => {
  const pastOnly = ["2020-01-06", "2020-01-13"];
  const future = ["2099-06-02"];

  test("auto-inactivates active bounded_series without upcoming occurrences (date only)", () => {
    expect(
      resolveEffectiveCourseStatus(
        "active",
        "bounded_series",
        pastOnly,
        "18:00",
        new Date("2026-05-18T12:00:00.000Z"),
      ),
    ).toBe("inactive");
  });

  test("keeps active on term day until course time has passed", () => {
    const termToday = ["2026-05-18"];
    expect(
      resolveEffectiveCourseStatus(
        "active",
        "bounded_series",
        termToday,
        "18:00",
        new Date("2026-05-18T10:00:00.000+02:00"),
      ),
    ).toBe("active");
    expect(
      resolveEffectiveCourseStatus(
        "active",
        "bounded_series",
        termToday,
        "18:00",
        new Date("2026-05-18T19:00:00.000+02:00"),
      ),
    ).toBe("inactive");
  });

  test("keeps active when future occurrence exists", () => {
    expect(
      resolveEffectiveCourseStatus("active", "bounded_series", future, "18:00", new Date("2026-05-18")),
    ).toBe("active");
  });

  test("does not change draft or inactive status", () => {
    expect(resolveEffectiveCourseStatus("draft", "bounded_series", pastOnly, "18:00")).toBe("draft");
    expect(resolveEffectiveCourseStatus("inactive", "bounded_series", future, "18:00")).toBe("inactive");
  });

  test("computeCourseReconcile flags persist when status or dates drift", () => {
    const statusOnly = computeCourseReconcile({
      storedStatus: "active",
      planningMode: "bounded_series",
      visibleDates: pastOnly,
      storedDates: pastOnly,
      courseTime: "18:00",
      now: new Date("2026-05-18T12:00:00.000Z"),
    });
    expect(statusOnly.shouldPersist).toBe(true);
    expect(statusOnly.statusChanged).toBe(true);
    expect(statusOnly.datesChanged).toBe(false);

    const datesOnly = computeCourseReconcile({
      storedStatus: "active",
      planningMode: "rolling_continuous",
      visibleDates: future,
      storedDates: pastOnly,
      courseTime: "18:00",
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
      courseTime: "18:00",
      now: new Date("2026-05-18"),
    });
    expect(noop.shouldPersist).toBe(false);
  });

  test("dateListsEqual ignores order", () => {
    expect(dateListsEqual(["2026-01-02", "2026-01-01"], ["2026-01-01", "2026-01-02"])).toBe(true);
  });
});
