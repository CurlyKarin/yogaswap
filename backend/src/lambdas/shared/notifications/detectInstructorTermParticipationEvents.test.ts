import { detectInstructorTermParticipationEvents } from "./detectInstructorTermParticipationEvents";

describe("detectInstructorTermParticipationEvents", () => {
  test("detects regular cancellation leaving the roster", () => {
    const events = detectInstructorTermParticipationEvents({
      before: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Kaja", "Manu"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      after: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Manu"],
        cancelledParticipants: ["Kaja"],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      stemParticipants: ["Kaja", "Manu"],
    });
    expect(events).toEqual([{ memberNickname: "Kaja", kind: "term_released" }]);
  });

  test("detects new short-notice cancellation", () => {
    const events = detectInstructorTermParticipationEvents({
      before: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Kaja"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      after: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Kaja"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: ["Kaja"],
      },
      stemParticipants: ["Kaja"],
    });
    expect(events).toEqual([{ memberNickname: "Kaja", kind: "short_notice" }]);
  });

  test("ignores unchanged overrides", () => {
    const override = {
      courseId: 1,
      date: "2026-11-03",
      participants: ["Kaja"],
      cancelledParticipants: [],
      swapped: [],
      waitlist: [],
      shortNoticeCancellations: [],
    };
    expect(
      detectInstructorTermParticipationEvents({
        before: override,
        after: { ...override },
        stemParticipants: ["Kaja"],
      }),
    ).toEqual([]);
  });

  test("detects regular cancellation withdrawn", () => {
    const events = detectInstructorTermParticipationEvents({
      before: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Manu"],
        cancelledParticipants: ["Kaja"],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      after: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Kaja", "Manu"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      stemParticipants: ["Kaja", "Manu"],
    });
    expect(events).toEqual([{ memberNickname: "Kaja", kind: "term_release_cleared" }]);
  });

  test("detects short-notice cancellation withdrawn", () => {
    const events = detectInstructorTermParticipationEvents({
      before: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Kaja"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: ["Kaja"],
      },
      after: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Kaja"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      stemParticipants: ["Kaja"],
    });
    expect(events).toEqual([{ memberNickname: "Kaja", kind: "short_notice_cleared" }]);
  });

  test("does not treat a swap-in as cancellation withdrawn", () => {
    const events = detectInstructorTermParticipationEvents({
      before: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Manu"],
        cancelledParticipants: [],
        swapped: [],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      after: {
        courseId: 1,
        date: "2026-11-03",
        participants: ["Manu"],
        cancelledParticipants: [],
        swapped: ["Ines"],
        waitlist: [],
        shortNoticeCancellations: [],
      },
      stemParticipants: ["Manu"],
    });
    expect(events).toEqual([]);
  });
});
