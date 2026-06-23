import {
  computeCourseReconcile,
  dateListsEqual,
  resolveEffectiveCourseStatus,
} from "./courseReconcile";

const pastBlock = {
  planningMode: "bounded_series",
  seriesEndDate: "2020-01-31",
  visibleUntil: "2020-01-31",
};

const futureBlock = {
  planningMode: "bounded_series",
  seriesEndDate: "2099-12-31",
  visibleUntil: "2099-12-31",
};

describe("courseReconcile", () => {
  const pastOnly = ["2020-01-06", "2020-01-13"];
  const future = ["2099-06-02"];

  test("auto-inactivates active bounded_series after block end + grace", () => {
    expect(
      resolveEffectiveCourseStatus(
        "active",
        pastBlock,
        pastOnly,
        "18:00",
        undefined,
        new Date("2026-05-18T12:00:00.000Z"),
      ),
    ).toBe("inactive");
  });

  test("keeps active bounded_series within block despite no upcoming occurrences", () => {
    expect(
      resolveEffectiveCourseStatus(
        "active",
        futureBlock,
        pastOnly,
        "18:00",
        undefined,
        new Date("2026-05-18T12:00:00.000Z"),
      ),
    ).toBe("active");
  });

  test("keeps active on term day while block still runs", () => {
    const termToday = ["2026-05-18"];
    const blockThroughJune = {
      planningMode: "bounded_series",
      seriesEndDate: "2026-06-30",
    };
    expect(
      resolveEffectiveCourseStatus(
        "active",
        blockThroughJune,
        termToday,
        "18:00",
        undefined,
        new Date(Date.UTC(2026, 4, 18, 10, 0, 0)),
      ),
    ).toBe("active");
    expect(
      resolveEffectiveCourseStatus(
        "active",
        blockThroughJune,
        termToday,
        "18:00",
        undefined,
        new Date(Date.UTC(2026, 4, 18, 19, 0, 0)),
      ),
    ).toBe("active");
  });

  test("keeps active when future occurrence exists", () => {
    expect(
      resolveEffectiveCourseStatus(
        "active",
        futureBlock,
        future,
        "18:00",
        undefined,
        new Date("2026-05-18"),
      ),
    ).toBe("active");
  });

  test("auto-inactivates rolling course with plannedEndDate after grace", () => {
    expect(
      resolveEffectiveCourseStatus(
        "active",
        { planningMode: "rolling_continuous", plannedEndDate: "2020-01-31" },
        pastOnly,
        "18:00",
        undefined,
        new Date("2026-05-18T12:00:00.000Z"),
      ),
    ).toBe("inactive");
  });

  test("does not auto-inactivate rolling course without plannedEndDate", () => {
    expect(
      resolveEffectiveCourseStatus(
        "active",
        { planningMode: "rolling_continuous" },
        pastOnly,
        "18:00",
        undefined,
        new Date("2026-05-18T12:00:00.000Z"),
      ),
    ).toBe("active");
  });

  test("auto-inactivates after last term grace when term exceeds block end", () => {
    const blockThroughJune = {
      planningMode: "bounded_series",
      seriesEndDate: "2026-06-30",
    };
    const lastTermAfterBlock = ["2026-07-05"];
    expect(
      resolveEffectiveCourseStatus(
        "active",
        blockThroughJune,
        lastTermAfterBlock,
        "18:00",
        undefined,
        new Date(Date.UTC(2026, 6, 10, 12, 0, 0)),
      ),
    ).toBe("active");
    expect(
      resolveEffectiveCourseStatus(
        "active",
        blockThroughJune,
        lastTermAfterBlock,
        "18:00",
        undefined,
        new Date(Date.UTC(2026, 6, 15, 12, 0, 0)),
      ),
    ).toBe("inactive");
  });

  test("does not change draft or inactive status", () => {
    expect(resolveEffectiveCourseStatus("draft", pastBlock, pastOnly, "18:00")).toBe("draft");
    expect(resolveEffectiveCourseStatus("inactive", futureBlock, future, "18:00")).toBe("inactive");
  });

  test("computeCourseReconcile flags persist when status or dates drift", () => {
    const statusOnly = computeCourseReconcile({
      storedStatus: "active",
      planningMode: "bounded_series",
      seriesEndDate: "2020-01-31",
      visibleUntil: "2020-01-31",
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
      seriesEndDate: "2099-12-31",
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
