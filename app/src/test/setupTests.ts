import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom implementiert alert/confirm/prompt nicht vollständig.
// Stubs verhindern "Not implemented"-Fehler und vermeiden hängende Test-Runs durch offene Handles.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "alert", {
    value: vi.fn(),
    writable: true,
  });
  Object.defineProperty(window, "confirm", {
    value: vi.fn(() => true),
    writable: true,
  });
  Object.defineProperty(window, "prompt", {
    value: vi.fn(() => null),
    writable: true,
  });
}

