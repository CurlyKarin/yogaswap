import { mapOverrideItem, mapStringList, stringListAttribute } from "./overrideDynamo";

describe("overrideDynamo", () => {
  it("mappt shortNoticeCancellations korrekt aus Dynamo-Item", () => {
    const mapped = mapOverrideItem({
      courseId: { S: "12" },
      date: { S: "2099-06-15" },
      participants: { L: [{ S: "alice" }] },
      swapped: { L: [] },
      waitlist: { L: [{ S: "mia" }] },
      shortNoticeCancellations: { L: [{ S: "Alice" }] },
    });
    expect(mapped.shortNoticeCancellations).toEqual(["Alice"]);
  });

  it("liefert leere Liste wenn String-List fehlt", () => {
    expect(mapStringList(undefined)).toEqual([]);
  });

  it("baut Dynamo-Stringliste für Update korrekt", () => {
    expect(stringListAttribute(["alice", "mia"])).toEqual({
      L: [{ S: "alice" }, { S: "mia" }],
    });
  });
});
