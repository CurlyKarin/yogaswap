import { describe, expect, it } from "vitest";
import { weekdayLabelDe } from "./weekdayLabels";

describe("weekdayLabelDe", () => {
  it("mappt Kurz- und Langformen auf deutsche Vollnamen", () => {
    expect(weekdayLabelDe("Mon")).toBe("Montag");
    expect(weekdayLabelDe("Monday")).toBe("Montag");
    expect(weekdayLabelDe("Thu")).toBe("Donnerstag");
    expect(weekdayLabelDe("Thursday")).toBe("Donnerstag");
  });

  it("gibt unbekannte Werte unverändert zurück", () => {
    expect(weekdayLabelDe("Foo")).toBe("Foo");
  });
});
