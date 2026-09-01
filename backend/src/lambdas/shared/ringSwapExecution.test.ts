import type { Course, CourseDateOverride, Swap } from "@yogaswap/shared";
import { buildRingSwapGraph, findRingCycles, selectDisjointCycles } from "./ringSwapGraph";
import { planRingCycleExecution } from "./ringSwapExecution";

function pendingSwap(
  input: Partial<Swap> & Pick<Swap, "participantId" | "fromCourseId" | "fromDate" | "toCourseId" | "toDate">,
): Swap {
  return {
    status: "pending",
    ...input,
  };
}

const courses: Course[] = [
  {
    id: 1,
    name: "A",
    weekday: "Mon",
    time: "10:00",
    capacity: 2,
    overbookLimit: 0,
    participants: ["Alice"],
    dates: ["2099-06-01"],
  },
  {
    id: 2,
    name: "B",
    weekday: "Tue",
    time: "10:00",
    capacity: 2,
    overbookLimit: 0,
    participants: ["Bob"],
    dates: ["2099-06-02"],
  },
  {
    id: 3,
    name: "C",
    weekday: "Wed",
    time: "10:00",
    capacity: 2,
    overbookLimit: 0,
    participants: ["Carol"],
    dates: ["2099-06-03"],
  },
];

describe("ringSwapExecution", () => {
  test("plans a 2-cycle with origin cleanup and target booking", () => {
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses,
      overrides: [],
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    expect(planned.plan.swapActivations).toHaveLength(2);
    expect(planned.plan.overrideWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "create",
          override: expect.objectContaining({
            courseId: 1,
            date: "2099-06-01",
            participants: [],
            cancelledParticipants: ["Alice"],
            swapped: ["Bob"],
          }),
        }),
        expect.objectContaining({
          mode: "create",
          override: expect.objectContaining({
            courseId: 2,
            date: "2099-06-02",
            participants: [],
            cancelledParticipants: ["Bob"],
            swapped: ["Alice"],
          }),
        }),
      ]),
    );
  });

  test("plans a 3-cycle", () => {
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 3, toDate: "2099-06-03" }),
      pendingSwap({ participantId: "Carol", fromCourseId: 3, fromDate: "2099-06-03", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses,
      overrides: [],
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.swapActivations).toHaveLength(3);
  });

  test("allows overbooked target in ring execution", () => {
    const fullCourses: Course[] = [
      {
        ...courses[0],
        participants: ["Alice", "Other"],
      },
      {
        ...courses[1],
        capacity: 1,
        overbookLimit: 1,
        participants: ["Bob"],
      },
    ];
    const overrides: CourseDateOverride[] = [
      {
        courseId: 2,
        date: "2099-06-02",
        participants: ["Bob", "Extra"],
        swapped: [],
        waitlist: ["Alice"],
      },
    ];
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses: fullCourses,
      overrides,
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(true);
  });

  test("rejects when user is not on origin", () => {
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));
    const coursesWithoutAlice = courses.map((course) =>
      course.id === 1 ? { ...course, participants: ["SomeoneElse"] } : course,
    );

    const planned = planRingCycleExecution(cycle!, {
      courses: coursesWithoutAlice,
      overrides: [],
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toMatch(/not booked on origin/i);
  });

  test("deletes alternate pending swaps from same origin", () => {
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 3, toDate: "2099-06-03" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses,
      overrides: [],
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.swapDeletions).toHaveLength(1);
    expect(planned.plan.swapDeletions[0]?.toCourseId).toBe(3);
  });

  test("rejects when target is in cutoff window", () => {
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses,
      overrides: [],
      pendingSwaps,
      now: new Date("2099-06-02T09:30:00"),
    });

    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toMatch(/cutoff/i);
  });

  test("allows ring when slot was already over room capacity", () => {
    const tightCourses: Course[] = [
      courses[0]!,
      { ...courses[1]!, capacity: 1, overbookLimit: 0, participants: ["Bob"] },
    ];
    const overrides: CourseDateOverride[] = [
      {
        courseId: 2,
        date: "2099-06-02",
        participants: ["Bob", "Extra"],
        swapped: [],
        waitlist: [],
      },
    ];
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses: tightCourses,
      overrides,
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(true);
  });

  test("rejects when origin user is not effectively booked", () => {
    const tightCourses: Course[] = [
      { ...courses[0]!, participants: ["Alice"] },
      { ...courses[1]!, capacity: 1, overbookLimit: 0, participants: ["Bob"] },
    ];
    const overrides: CourseDateOverride[] = [
      {
        courseId: 2,
        date: "2099-06-02",
        participants: [],
        cancelledParticipants: ["Bob"],
        swapped: ["Extra"],
        waitlist: [],
      },
    ];
    const pendingSwaps = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ];
    const graph = buildRingSwapGraph(pendingSwaps);
    const [cycle] = selectDisjointCycles(findRingCycles(graph));

    const planned = planRingCycleExecution(cycle!, {
      courses: tightCourses,
      overrides,
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toMatch(/not booked on origin/i);
  });
});
