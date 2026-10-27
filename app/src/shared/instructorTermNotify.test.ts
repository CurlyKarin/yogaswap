import { describe, expect, it } from "vitest";
import { shouldNotifyInstructorsForTermParticipation } from "shared/tenantSettings";
import type { TenantSettings } from "shared/types";

describe("shouldNotifyInstructorsForTermParticipation (#398)", () => {
  const dateIso = "2026-11-03";
  const time = "18:00";
  // Termin 3.11. 18:00 local → Fenster relativ dazu.

  it("default aus ohne Master-Schalter", () => {
    expect(
      shouldNotifyInstructorsForTermParticipation({}, dateIso, time, new Date("2026-11-03T16:00:00")),
    ).toBe(false);
  });

  it("Master an ohne Fenster: vor Termin ja, nach Start nein", () => {
    const settings: TenantSettings = { notifyInstructorsOnTermParticipationChange: true };
    expect(
      shouldNotifyInstructorsForTermParticipation(
        settings,
        dateIso,
        time,
        new Date("2026-11-03T10:00:00"),
      ),
    ).toBe(true);
    expect(
      shouldNotifyInstructorsForTermParticipation(
        settings,
        dateIso,
        time,
        new Date("2026-11-03T18:30:00"),
      ),
    ).toBe(false);
  });

  it("Startfenster 24h: zu früh still, innerhalb offen", () => {
    const settings: TenantSettings = {
      notifyInstructorsOnTermParticipationChange: true,
      instructorTermNotifyFromHoursBeforeStart: 24,
    };
    expect(
      shouldNotifyInstructorsForTermParticipation(
        settings,
        dateIso,
        time,
        new Date("2026-11-01T18:00:00"),
      ),
    ).toBe(false);
    expect(
      shouldNotifyInstructorsForTermParticipation(
        settings,
        dateIso,
        time,
        new Date("2026-11-02T19:00:00"),
      ),
    ).toBe(true);
  });

  it("Bis-Fenster 60 Min: im Cutoff still", () => {
    const settings: TenantSettings = {
      notifyInstructorsOnTermParticipationChange: true,
      instructorTermNotifyUntilMinutesBeforeStart: 60,
    };
    expect(
      shouldNotifyInstructorsForTermParticipation(
        settings,
        dateIso,
        time,
        new Date("2026-11-03T16:30:00"),
      ),
    ).toBe(true);
    expect(
      shouldNotifyInstructorsForTermParticipation(
        settings,
        dateIso,
        time,
        new Date("2026-11-03T17:30:00"),
      ),
    ).toBe(false);
  });
});
