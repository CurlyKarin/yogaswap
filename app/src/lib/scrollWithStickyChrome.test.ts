import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTouchCoarseViewport, scrollIntoViewWithStickyChrome } from "./scrollWithStickyChrome";

describe("scrollWithStickyChrome", () => {
  beforeEach(() => {
    document.documentElement.style.setProperty("--app-sticky-chrome-height", "80px");
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--app-sticky-chrome-height");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("scrolls the window when app-scroll-root does not scroll", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    document.body.innerHTML = `
      <div class="app-scroll-root" style="overflow-y: visible">
        <div id="target" style="height: 20px"></div>
      </div>
    `;
    const target = document.getElementById("target") as HTMLElement;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 200,
      left: 0,
      right: 0,
      bottom: 220,
      width: 0,
      height: 20,
      x: 0,
      y: 200,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, "scrollY", { value: 100, configurable: true });

    scrollIntoViewWithStickyChrome(target);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 212, behavior: "auto" });
  });

  it("scrolls app-scroll-root when it is the scroll container", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    document.body.innerHTML = `
      <div class="app-scroll-root" style="overflow-y: auto; height: 200px">
        <div id="target" style="height: 20px"></div>
      </div>
    `;
    const scrollRoot = document.querySelector(".app-scroll-root") as HTMLElement;
    const target = document.getElementById("target") as HTMLElement;
    scrollRoot.scrollTop = 40;
    const scrollTo = vi.fn();
    scrollRoot.scrollTo = scrollTo;
    vi.spyOn(scrollRoot, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      right: 0,
      bottom: 200,
      width: 0,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 160,
      left: 0,
      right: 0,
      bottom: 180,
      width: 0,
      height: 20,
      x: 0,
      y: 160,
      toJSON: () => ({}),
    });

    scrollIntoViewWithStickyChrome(target, { behavior: "smooth" });

    expect(scrollTo).toHaveBeenCalledWith({ top: 112, behavior: "smooth" });
  });

  it("detects coarse touch viewports", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);
    expect(isTouchCoarseViewport()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(hover: none) and (pointer: coarse)");
  });
});
