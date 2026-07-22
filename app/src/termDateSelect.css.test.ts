import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract: light app chrome + custom term list stay readable when OS is dark.
 * Native <select> popups cannot be forced light on macOS; TermDateSelect owns the list.
 */
describe("light form chrome under OS dark preference (#257)", () => {
  const appCss = readFileSync(resolve(__dirname, "App.css"), "utf8");
  const indexCss = readFileSync(resolve(__dirname, "index.css"), "utf8");

  it("pins root/body to light color-scheme with dark text", () => {
    expect(indexCss).toMatch(/:root\s*\{[^}]*color-scheme:\s*only light/s);
    expect(indexCss).toMatch(/:root\s*\{[^}]*color:\s*#213547/s);
    expect(appCss).toMatch(/body\s*\{[^}]*color-scheme:\s*only light/s);
    expect(appCss).toMatch(/body\s*\{[^}]*color:\s*#213547/s);
  });

  it("styles custom term picker trigger and list as light surfaces", () => {
    expect(appCss).toMatch(/\.term-date-select\s*\{[^}]*background-color:\s*#ffffff/s);
    expect(appCss).toMatch(/\.term-date-select\s*\{[^}]*border:\s*1px solid #ddd/s);
    expect(appCss).toMatch(/\.term-date-select-list\s*\{[^}]*background-color:\s*#ffffff/s);
    expect(appCss).toMatch(/\.term-date-select-list\s*\{[^}]*color-scheme:\s*only light/s);
  });
});
