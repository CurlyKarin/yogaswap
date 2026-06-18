import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import GuestSeatControls from "./GuestSeatControls";

function renderGuestSeatControls(
  overrides: Partial<React.ComponentProps<typeof GuestSeatControls>> = {},
) {
  const onAddGuest = vi.fn();
  const onRemoveGuest = vi.fn();

  render(
    <GuestSeatControls
      guestCount={2}
      canAddGuest
      canRemoveGuest
      onAddGuest={onAddGuest}
      onRemoveGuest={onRemoveGuest}
      {...overrides}
    />,
  );

  return { onAddGuest, onRemoveGuest };
}

describe("GuestSeatControls", () => {
  afterEach(() => {
    cleanup();
  });

  it("zeigt Anzahl und Gruppe mit aria-label", () => {
    renderGuestSeatControls({ guestCount: 3 });

    expect(screen.getByRole("group", { name: "Gastplätze verwalten" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("ruft onAddGuest und onRemoveGuest auf", () => {
    const { onAddGuest, onRemoveGuest } = renderGuestSeatControls();

    fireEvent.click(screen.getByRole("button", { name: "Gastplatz hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "Gastplatz entfernen" }));

    expect(onAddGuest).toHaveBeenCalledTimes(1);
    expect(onRemoveGuest).toHaveBeenCalledTimes(1);
  });

  it("deaktiviert Plus bei canAddGuest false", () => {
    renderGuestSeatControls({ canAddGuest: false });

    expect(screen.getByRole("button", { name: "Gastplatz hinzufügen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gastplatz entfernen" })).toBeEnabled();
  });

  it("deaktiviert Minus bei canRemoveGuest false", () => {
    renderGuestSeatControls({ canRemoveGuest: false });

    expect(screen.getByRole("button", { name: "Gastplatz entfernen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gastplatz hinzufügen" })).toBeEnabled();
  });

  it("deaktiviert beide Buttons bei saving", () => {
    renderGuestSeatControls({ saving: true });

    expect(screen.getByRole("button", { name: "Gastplatz hinzufügen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gastplatz entfernen" })).toBeDisabled();
  });

  it("deaktiviert beide Buttons bei disabled", () => {
    renderGuestSeatControls({ disabled: true });

    expect(screen.getByRole("button", { name: "Gastplatz hinzufügen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gastplatz entfernen" })).toBeDisabled();
  });

  it("ruft Handler nicht auf, wenn Buttons deaktiviert sind", () => {
    const { onAddGuest, onRemoveGuest } = renderGuestSeatControls({
      canAddGuest: false,
      canRemoveGuest: false,
      saving: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Gastplatz hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "Gastplatz entfernen" }));

    expect(onAddGuest).not.toHaveBeenCalled();
    expect(onRemoveGuest).not.toHaveBeenCalled();
  });
});
