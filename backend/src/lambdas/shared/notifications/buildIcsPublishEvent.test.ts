import { buildIcsPublishEvent } from "./buildIcsPublishEvent";

describe("buildIcsPublishEvent", () => {
  test("builds publish event with local start and end", () => {
    const ics = buildIcsPublishEvent({
      uid: "tenant/1/2026-06-20@yogaswap",
      summary: "Morgenyoga",
      description: "YogaSwap-Termin",
      isoDate: "2026-06-20",
      time: "18:00",
      durationMinutes: 90,
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("UID:tenant/1/2026-06-20@yogaswap");
    expect(ics).toContain("DTSTART:20260620T180000");
    expect(ics).toContain("DTEND:20260620T193000");
    expect(ics).toContain("SUMMARY:Morgenyoga");
  });

  test("returns null for invalid date/time", () => {
    expect(
      buildIcsPublishEvent({
        uid: "x",
        summary: "Kurs",
        isoDate: "invalid",
        time: "18:00",
      }),
    ).toBeNull();
  });
});
