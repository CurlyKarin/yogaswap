import { describe, it, expect } from "vitest";
import type { Course, Swap } from "shared/types";
import {
  courseTermActionLabel,
  formatSwapStatusLine,
  swapTermIsoForCourse,
} from "./courseTermActionLabels";

const baseCourse: Course = {
  tenantId: "default-tenant",
  id: 1,
  name: "Yoga Basic",
  weekday: "Monday",
  time: "10:00",
  capacity: 10,
  participants: ["alice"],
  dates: ["2099-06-16"],
};

const targetCourse: Course = {
  ...baseCourse,
  id: 2,
  name: "Yoga Advanced",
  dates: ["2099-06-17"],
};

const pendingSwap: Swap = {
  user: "alice",
  fromCourseId: 1,
  fromDate: "2099-06-16",
  toCourseId: 2,
  toDate: "2099-06-17",
  status: "pending",
};

describe("courseTermActionLabel", () => {
  it("verknüpft Aktion, Kursname und formatiertes Datum", () => {
    expect(courseTermActionLabel("Yoga Basic", "Termin absagen", "2099-06-16")).toBe(
      "Termin absagen, Yoga Basic, 16.06.2099",
    );
  });

  it("hängt optionale Zusatzteile an", () => {
    expect(
      courseTermActionLabel("Yoga Basic", "Tauschanfragen abbrechen", "2099-06-16", [
        "Tauschanfrage für 17.06.2099 · Yoga Advanced",
      ]),
    ).toBe(
      "Tauschanfragen abbrechen, Yoga Basic, 16.06.2099, Tauschanfrage für 17.06.2099 · Yoga Advanced",
    );
  });
});

describe("formatSwapStatusLine", () => {
  it("beschreibt ausgehende pending Tauschanfrage", () => {
    expect(formatSwapStatusLine(pendingSwap, 1, [baseCourse, targetCourse])).toBe(
      "Tauschanfrage für 17.06.2099 · Yoga Advanced",
    );
  });

  it("beschreibt eingehende pending Tauschanfrage", () => {
    expect(formatSwapStatusLine(pendingSwap, 2, [baseCourse, targetCourse])).toBe(
      "Tauschanfrage zu 16.06.2099 · Yoga Basic",
    );
  });
});

describe("swapTermIsoForCourse", () => {
  it("nutzt fromDate für Ursprungskurs und toDate für Zielkurs", () => {
    expect(swapTermIsoForCourse(pendingSwap, 1)).toBe("2099-06-16");
    expect(swapTermIsoForCourse(pendingSwap, 2)).toBe("2099-06-17");
  });
});
