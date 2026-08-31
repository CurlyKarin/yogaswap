import { afterEach, describe, expect, it, vi } from "vitest";
import { focusModalOnOpen, focusWithVisibleRing } from "./focusWithVisibleRing";

describe("focusModalOnOpen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("focuses the container on touch viewports", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    document.body.innerHTML = `
      <div id="modal" tabindex="-1">
        <input type="text" />
      </div>
    `;
    const modal = document.getElementById("modal") as HTMLElement;
    const focus = vi.spyOn(modal, "focus");

    focusModalOnOpen(modal, { preferInput: true });

    expect(focus).toHaveBeenCalled();
    expect((focus.mock.calls[0]?.[0] as { focusVisible?: boolean })?.focusVisible).toBe(true);
  });

  it("focuses the first input on desktop when preferInput is set", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    document.body.innerHTML = `
      <div id="modal" tabindex="-1">
        <input id="field" type="text" />
      </div>
    `;
    const input = document.getElementById("field") as HTMLInputElement;
    const focus = vi.spyOn(input, "focus");

    focusModalOnOpen(document.getElementById("modal") as HTMLElement, { preferInput: true });

    expect(focus).toHaveBeenCalled();
  });

  it("exposes focusWithVisibleRing", () => {
    document.body.innerHTML = `<button id="btn" type="button">OK</button>`;
    const button = document.getElementById("btn") as HTMLButtonElement;
    const focus = vi.spyOn(button, "focus");
    focusWithVisibleRing(button);
    expect(focus).toHaveBeenCalled();
  });
});
