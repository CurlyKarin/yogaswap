import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { startOfWeekMonday } from "./courseWeek";
import {
  buildWeekAnchorStorageKey,
  clampWeekAnchor,
  readStoredWeekAnchor,
  resolveInitialWeekAnchor,
  writeStoredWeekAnchor,
} from "./weekNavPersistence";

describe("weekNavPersistence", () => {
  const storageKey = buildWeekAnchorStorageKey("default-tenant", "maya");

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("builds a tenant- and user-scoped storage key", () => {
    expect(buildWeekAnchorStorageKey("studio-a", "luna")).toBe(
      "yogaswap.weekAnchor:studio-a:luna",
    );
  });

  it("round-trips a week anchor through sessionStorage", () => {
    const anchor = startOfWeekMonday(new Date(2099, 5, 14));
    writeStoredWeekAnchor(storageKey, anchor);
    expect(readStoredWeekAnchor(storageKey)?.getTime()).toBe(anchor.getTime());
  });

  it("returns null for invalid stored values", () => {
    sessionStorage.setItem(storageKey, "not-a-date");
    expect(readStoredWeekAnchor(storageKey)).toBeNull();
  });

  it("clamps stored weeks to earliestWeekAnchor", () => {
    const earliest = startOfWeekMonday(new Date(2026, 2, 2));
    const tooEarly = startOfWeekMonday(new Date(2026, 1, 2));
    writeStoredWeekAnchor(storageKey, tooEarly);

    const resolved = resolveInitialWeekAnchor(storageKey, earliest);
    expect(resolved.getTime()).toBe(earliest.getTime());
  });

  it("keeps in-range weeks unchanged", () => {
    const earliest = startOfWeekMonday(new Date(2026, 0, 5));
    const latest = startOfWeekMonday(new Date(2027, 0, 4));
    const stored = startOfWeekMonday(new Date(2026, 5, 14));
    writeStoredWeekAnchor(storageKey, stored);

    expect(resolveInitialWeekAnchor(storageKey, earliest, latest).getTime()).toBe(stored.getTime());
    expect(clampWeekAnchor(stored, earliest, latest).getTime()).toBe(stored.getTime());
  });

  it("clamps stored weeks to latestWeekAnchor", () => {
    const earliest = startOfWeekMonday(new Date(2026, 0, 5));
    const latest = startOfWeekMonday(new Date(2027, 0, 4));
    const tooLate = startOfWeekMonday(new Date(2099, 5, 14));
    writeStoredWeekAnchor(storageKey, tooLate);

    expect(resolveInitialWeekAnchor(storageKey, earliest, latest).getTime()).toBe(latest.getTime());
    expect(clampWeekAnchor(tooLate, earliest, latest).getTime()).toBe(latest.getTime());
  });
});
