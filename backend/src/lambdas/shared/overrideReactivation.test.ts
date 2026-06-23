import {
  collectOverrideKeysForReactivationCleanup,
  isCancelledTombstoneOverride,
  resolveReactivatedExcludedDates,
  resolveVisibleActiveDates,
} from "./overrideReactivation";

describe("overrideReactivation", () => {
  it("erkennt leere Absage-Tombstones", () => {
    expect(
      isCancelledTombstoneOverride({
        participants: { L: [] },
        swapped: { L: [] },
        waitlist: { L: [] },
      }),
    ).toBe(true);
    expect(
      isCancelledTombstoneOverride({
        participants: { L: [{ S: "luna" }] },
        swapped: { L: [] },
        waitlist: { L: [] },
      }),
    ).toBe(false);
  });

  it("ermittelt reaktivierte Ausschlüsse", () => {
    expect(resolveReactivatedExcludedDates(["2026-01-06", "2026-01-13"], ["2026-01-13"])).toEqual([
      "2026-01-06",
    ]);
  });

  it("sammelt Override-Keys für Reaktivierung und sichtbare Tombstones", () => {
    const keys = collectOverrideKeysForReactivationCleanup({
      courseId: "1",
      reactivatedExcludedDates: ["2026-01-06"],
      visibleActiveDatesForTombstoneScan: ["2026-02-02", "2026-03-02"],
      overrideItems: [
        {
          date: { S: "2026-02-02" },
          participants: { L: [] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
        {
          date: { S: "2026-03-02" },
          participants: { L: [{ S: "maya" }] },
          swapped: { L: [] },
          waitlist: { L: [] },
        },
      ],
    });
    expect(keys).toEqual(["1_2026-01-06", "1_2026-02-02"]);
  });

  it("filtert sichtbare Termine ohne Ausschluss", () => {
    expect(resolveVisibleActiveDates(["2026-01-06", "2026-01-13"], ["2026-01-13"])).toEqual([
      "2026-01-06",
    ]);
  });
});
