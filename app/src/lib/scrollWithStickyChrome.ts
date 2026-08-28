export function isTouchCoarseViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function getScrollRoot(): HTMLElement | null {
  const root = document.querySelector(".app-scroll-root");
  if (!(root instanceof HTMLElement)) return null;
  const { overflowY } = getComputedStyle(root);
  return overflowY === "auto" || overflowY === "scroll" ? root : null;
}

function readStickyChromeHeight(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-sticky-chrome-height")
    .trim();
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  let height = 0;
  const header = document.querySelector(".app-top");
  const toolbar = document.getElementById("course-toolbar");
  if (header instanceof HTMLElement) height += header.offsetHeight;
  if (toolbar instanceof HTMLElement) height += toolbar.offsetHeight;
  return height;
}

export type ScrollWithStickyChromeOptions = {
  behavior?: ScrollBehavior;
  extraOffset?: number;
};

/** Scrollt ein Element unter Header + Kurs-Toolbar (ohne natives scrollIntoView auf iOS). */
export function scrollIntoViewWithStickyChrome(
  element: HTMLElement,
  options: ScrollWithStickyChromeOptions = {},
): void {
  const behavior =
    options.behavior ?? (isTouchCoarseViewport() ? "auto" : "smooth");
  const chromeOffset = readStickyChromeHeight() + (options.extraOffset ?? 8);
  const scrollRoot = getScrollRoot();

  if (scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const top = scrollRoot.scrollTop + elementRect.top - rootRect.top - chromeOffset;
    scrollRoot.scrollTo({ top: Math.max(0, top), behavior });
    return;
  }

  const elementRect = element.getBoundingClientRect();
  const top = window.scrollY + elementRect.top - chromeOffset;
  window.scrollTo({ top: Math.max(0, top), behavior });
}
