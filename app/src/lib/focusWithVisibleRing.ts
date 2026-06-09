type FocusOptionsWithVisible = FocusOptions & { focusVisible?: boolean };

/** Programmatic focus that requests a visible ring (focus trap / modal open). */
export function focusWithVisibleRing(element: HTMLElement) {
  element.focus({ focusVisible: true } as FocusOptionsWithVisible);
}
