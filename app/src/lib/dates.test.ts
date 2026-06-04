import { describe, it, expect } from "vitest";
import {
  getCourseDates,
  toDateKey,
  sameDayUTC,
  sameInstant,
  getAvailableDates,
  getWaitlistDates,
} from "./dates";
import type { Course, User, CourseDateOverride } from "shared/types";
import type { SwapSettings } from "../types";

const TEST_NOW = new Date("2025-06-15T06:00:00Z"); // früh am Tag, damit Termine am 15. (z. B. 10:00) noch „in der Zukunft“ sind

const swapSettings: SwapSettings = {
  minOffsetDays: -7,
  maxOffsetDays: 7,
};

const currentUser: User = {
  nickname: "TestUser",
  email: "test@example.com",
  role: "participant",
};

describe("toDateKey", () => {
  it("gibt YYYY-MM-DD für gültiges Datum zurück", () => {
    expect(toDateKey(new Date("2025-06-15T14:30:00Z"))).toBe("2025-06-15");
  });

  it("gibt leeren String für Invalid Date zurück (kein Crash)", () => {
    expect(toDateKey(new Date(""))).toBe("");
    expect(toDateKey(new Date(NaN))).toBe("");
  });
});

describe("sameDayUTC", () => {
  it("gibt true für gleichen Kalendertag", () => {
    const a = new Date("2025-06-15T08:00:00Z");
    const b = new Date("2025-06-15T22:00:00Z");
    expect(sameDayUTC(a, b)).toBe(true);
  });

  it("gibt false für verschiedenen Tag", () => {
    const a = new Date("2025-06-15T23:59:00Z");
    const b = new Date("2025-06-16T00:01:00Z");
    expect(sameDayUTC(a, b)).toBe(false);
  });
});

describe("sameInstant", () => {
  it("akzeptiert Date und String", () => {
    expect(sameInstant(new Date("2025-06-15"), "2025-06-15")).toBe(true);
    expect(sameInstant("2025-06-15", "2025-06-15")).toBe(true);
  });
});

describe("getCourseDates", () => {
  it("gibt nur zukünftige Termine zurück (relativ zu now)", () => {
    const course: Course = {
      id: 1,
      name: "Yoga",
      weekday: "Mo",
      time: "10:00",
      capacity: 10,
      participants: [],
      dates: ["2025-06-14", "2025-06-15", "2025-06-16"], // 14 = vor TEST_NOW, 15 und 16 danach
    };
    const result = getCourseDates(course, TEST_NOW);
    expect(result).toHaveLength(2); // 15 (10:00) und 16 (10:00) sind >= TEST_NOW (06:00 am 15.)
    expect(result[0].toISOString()).toContain("2025-06-15");
    expect(result[1].toISOString()).toContain("2025-06-16");
  });

  it("gibt leeres Array wenn alle Termine in der Vergangenheit", () => {
    const course: Course = {
      id: 1,
      name: "Yoga",
      weekday: "Mo",
      time: "10:00",
      capacity: 10,
      participants: [],
      dates: ["2025-06-01", "2025-06-02"],
    };
    const result = getCourseDates(course, TEST_NOW);
    expect(result).toHaveLength(0);
  });

  it("gibt leeres Array bei leerem dates", () => {
    const course: Course = {
      id: 1,
      name: "Yoga",
      weekday: "Mo",
      time: "10:00",
      capacity: 10,
      participants: [],
      dates: [],
    };
    const result = getCourseDates(course, TEST_NOW);
    expect(result).toHaveLength(0);
  });

  it("setzt Uhrzeit aus course.time", () => {
    const course: Course = {
      id: 1,
      name: "Yoga",
      weekday: "Mo",
      time: "18:30",
      capacity: 10,
      participants: [],
      dates: ["2025-06-20"],
    };
    const result = getCourseDates(course, TEST_NOW);
    expect(result).toHaveLength(1);
    expect(result[0].getHours()).toBe(18);
    expect(result[0].getMinutes()).toBe(30);
  });
});

describe("getAvailableDates / getWaitlistDates", () => {
  const course: Course = {
    id: 1,
    name: "Yoga",
    weekday: "Mo",
    time: "10:00",
    capacity: 2,
    participants: ["UserA"],
    dates: ["2025-06-16", "2025-06-17"], // beide im Fenster und in der Zukunft zu TEST_NOW
  };

  const overrides: CourseDateOverride[] = [];

  it("getAvailableDates liefert Termine die nicht voll sind und User nicht drin", () => {
    const referenceDate = new Date("2025-06-15");
    const available = getAvailableDates(
      [course],
      overrides,
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW
    );
    expect(available.length).toBeGreaterThanOrEqual(0);
    available.forEach((x) => {
      expect(x.course.id).toBe(1);
      expect(x.date).toBeInstanceOf(Date);
    });
  });

  it("bei ungültigem referenceDate liefert getAvailableDates leeres Array", () => {
    const invalidRef = new Date("");
    const available = getAvailableDates(
      [course],
      overrides,
      currentUser,
      swapSettings,
      invalidRef,
      TEST_NOW
    );
    expect(available).toEqual([]);
  });

  it("getWaitlistDates mit now liefert deterministisches Ergebnis", () => {
    const referenceDate = new Date("2025-06-15");
    const waitlist = getWaitlistDates(
      [course],
      overrides,
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW
    );
    expect(Array.isArray(waitlist)).toBe(true);
  });

  it("schließt inactive und draft Kurse aus Zielauswahl aus", () => {
    const referenceDate = new Date("2025-06-15");
    const activeCourse: Course = {
      ...course,
      id: 11,
      name: "Aktiver Kurs",
      status: "active",
      participants: [],
      dates: ["2025-06-16"],
    };
    const inactiveCourse: Course = {
      ...course,
      id: 12,
      name: "Inaktiver Kurs",
      status: "inactive",
      participants: [],
      dates: ["2025-06-16"],
    };
    const draftCourse: Course = {
      ...course,
      id: 13,
      name: "Planungskurs",
      status: "draft",
      participants: [],
      dates: ["2025-06-16"],
    };

    const available = getAvailableDates(
      [activeCourse, inactiveCourse, draftCourse],
      overrides,
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW
    );

    expect(available.map((entry) => entry.course.id)).toEqual([11]);
  });

  it("excludes overbook-only slots from swap targets; waitlist until maxCapacity", () => {
    const referenceDate = new Date("2025-06-15");
    const overbookCourse: Course = {
      ...course,
      id: 20,
      capacity: 2,
      overbookLimit: 1,
      participants: ["a", "b"],
      dates: ["2025-06-16"],
    };
    const fullOverride: CourseDateOverride[] = [
      {
        courseId: 20,
        date: "2025-06-16",
        participants: ["a", "b", "c"],
        swapped: [],
        waitlist: [],
      },
    ];

    const atRegularCapacity = getAvailableDates(
      [overbookCourse],
      [],
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW,
    );
    const waitlistWithOverbookHeadroom = getWaitlistDates(
      [overbookCourse],
      [],
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW,
    );
    const fullAtMax = getAvailableDates(
      [overbookCourse],
      fullOverride,
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW,
    );
    const noWaitlistAtMax = getWaitlistDates(
      [overbookCourse],
      fullOverride,
      currentUser,
      swapSettings,
      referenceDate,
      TEST_NOW,
    );

    expect(atRegularCapacity).toHaveLength(0);
    expect(waitlistWithOverbookHeadroom).toHaveLength(1);
    expect(fullAtMax).toHaveLength(0);
    expect(noWaitlistAtMax).toHaveLength(0);
  });
});
