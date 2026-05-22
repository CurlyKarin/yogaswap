import {
  assessHorizonShrinkBlockers,
  computeHorizonShrinkStrip,
  countOverrideCommitmentsInHorizonStrip,
  countSwapCommitmentsInHorizonStrip,
  formatHorizonShrinkBlockedMessage,
} from "@yogaswap/shared";

describe("rollingHorizonShrink", () => {
  const now = new Date("2026-05-19T12:00:00.000Z");

  test("computeHorizonShrinkStrip returns null when horizon grows or stays", () => {
    expect(computeHorizonShrinkStrip(8, 8, now)).toBeNull();
    expect(computeHorizonShrinkStrip(5, 8, now)).toBeNull();
  });

  test("computeHorizonShrinkStrip covers dates after new end through old end", () => {
    const strip = computeHorizonShrinkStrip(8, 5, now);
    expect(strip).toEqual({
      startInclusive: "2026-06-24",
      endInclusive: "2026-07-14",
    });
  });

  test("counts swap commitments on rolling courses in strip only", () => {
    const strip = computeHorizonShrinkStrip(8, 5, now)!;
    const rolling = new Set(["1"]);
    const swaps = [
      {
        fromCourseId: "1",
        toCourseId: "2",
        fromDate: "2026-06-24",
        toDate: "2026-08-01",
        status: "pending",
      },
      {
        fromCourseId: "1",
        toCourseId: "2",
        fromDate: "2026-05-20",
        toDate: "2026-06-24",
        status: "pending",
      },
      {
        fromCourseId: "3",
        toCourseId: "1",
        fromDate: "2026-07-01",
        toDate: "2026-06-24",
        status: "active",
      },
    ];
    expect(countSwapCommitmentsInHorizonStrip(swaps, rolling, strip)).toBe(2);
  });

  test("counts overrides with open schedule state in strip", () => {
    const strip = computeHorizonShrinkStrip(8, 5, now)!;
    const rolling = new Set(["1"]);
    const overrides = [
      {
        courseId: "1",
        date: "2026-07-01",
        participantsCount: 0,
        swappedCount: 1,
        waitlistCount: 0,
      },
      {
        courseId: "1",
        date: "2026-05-20",
        participantsCount: 1,
        swappedCount: 0,
        waitlistCount: 0,
      },
      {
        courseId: "2",
        date: "2026-07-01",
        participantsCount: 0,
        swappedCount: 1,
        waitlistCount: 0,
      },
    ];
    expect(countOverrideCommitmentsInHorizonStrip(overrides, rolling, strip)).toBe(1);
  });

  test("assessHorizonShrinkBlockers aggregates counts", () => {
    const blockers = assessHorizonShrinkBlockers({
      currentWeeks: 8,
      nextWeeks: 5,
      rollingCourseIds: new Set(["1"]),
      swaps: [
        {
          fromCourseId: "1",
          toCourseId: "2",
          fromDate: "2026-06-24",
          toDate: "2026-08-01",
          status: "pending",
        },
      ],
      overrides: [
        {
          courseId: "1",
          date: "2026-07-01",
          participantsCount: 0,
          swappedCount: 1,
          waitlistCount: 0,
        },
      ],
      now,
    });
    expect(blockers).toMatchObject({ swapCount: 1, overrideCount: 1 });
    expect(formatHorizonShrinkBlockedMessage(blockers!)).toMatch(/nicht verkleinert/);
  });
});
