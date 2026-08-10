import { describe, it, expect } from "vitest";
import { getEffectiveParticipants, getStatusPresentation } from "./participants";
import type { Course, CourseDateOverride } from "shared/types";

const baseCourse: Course = {
  id: 1,
  name: "Yoga Basics",
  weekday: "Mon",
  time: "18:30",
  capacity: 10,
  participants: ["alice", "bob"],
  dates: ["2025-06-16", "2025-06-23"],
};

describe("getEffectiveParticipants", () => {
  it("gibt course.participants zurück, wenn kein Override für Kurs+Datum existiert", () => {
    const overrides: CourseDateOverride[] = [];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("gibt override.participants zurück, wenn Override für gleichen Kurs und gleiches Datum existiert", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: ["alice", "bob", "charlie"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual([
      "alice",
      "bob",
      "charlie",
    ]);
  });

  it("behält Stamm bei Legacy-Override mit leerem participants (Gast-Stub)", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: [],
        anonymousTrialCount: 1,
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("behält Stamm bei Guest-only-Override (Delta ohne cancelledParticipants)", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: [],
        cancelledParticipants: [],
        anonymousTrialCount: 1,
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("wendet cancelledParticipants und swapped im Delta-Modus an", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: [],
        cancelledParticipants: ["bob"],
        swapped: ["charlie"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual([
      "alice",
      "charlie",
    ]);
  });

  it("ignoriert Override mit anderem courseId", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 2,
        date: "2025-06-16",
        participants: ["other"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("ignoriert Override mit anderem Datum", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-23",
        participants: ["only-on-23"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("gibt leeres Array zurück, wenn Legacy-Override bewusst leere Belegung speichert und swapped leer ist — Gast-Stub behält Stamm", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: [],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });
});

describe("getStatusPresentation", () => {
  it("liefert registriert in grün für active", () => {
    expect(getStatusPresentation("active")).toEqual({
      color: "#16a34a",
      label: "registriert",
    });
  });

  it("liefert eingeladen in gelb für invited", () => {
    expect(getStatusPresentation("invited")).toEqual({
      color: "#facc15",
      label: "eingeladen",
    });
  });

  it("liefert ohne Login in orange für no_login", () => {
    expect(getStatusPresentation("no_login")).toEqual({
      color: "#fb923c",
      label: "ohne Login",
    });
  });
});
