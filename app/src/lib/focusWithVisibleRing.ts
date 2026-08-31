type FocusOptionsWithVisible = FocusOptions & { focusVisible?: boolean };

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Programmatic focus that requests a visible ring (focus trap / modal open). */
export function focusWithVisibleRing(element: HTMLElement) {
  element.focus({ focusVisible: true } as FocusOptionsWithVisible);
}

function isTouchCoarseViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

type FocusModalOnOpenOptions = {
  /** Auf Desktop das erste Eingabefeld fokussieren (Touch: immer nur der Container). */
  preferInput?: boolean;
};

/** Modal öffnen: auf Touch nur Container (keine Tastatur), auf Desktop optional erstes Feld. */
export function focusModalOnOpen(container: HTMLElement, options: FocusModalOnOpenOptions = {}) {
  if (isTouchCoarseViewport()) {
    focusWithVisibleRing(container);
    return;
  }

  const focusables = getFocusableElements(container);
  if (options.preferInput) {
    const preferredInput = focusables.find(
      (el) => el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA",
    );
    if (preferredInput) {
      focusWithVisibleRing(preferredInput);
      return;
    }
  }

  const first = focusables[0];
  if (first) {
    focusWithVisibleRing(first);
    return;
  }

  focusWithVisibleRing(container);
}
