import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import AdminPanel from "./AdminPanel";
import { inviteUser } from "../api/participants";

vi.mock("../api/participants", () => ({
  inviteUser: vi.fn(),
}));

const mockedInviteUser = inviteUser as unknown as ReturnType<typeof vi.fn>;

describe("AdminPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deaktiviert den Einladen-Button, wenn Email oder Nickname fehlen", () => {
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    const button = within(panel).getByRole("button", { name: /Einladen/i });
    expect(button).toBeDisabled();

    // Nur Nickname
    fireEvent.change(within(panel).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    expect(button).toBeDisabled();

    // Nur E-Mail
    fireEvent.change(within(panel).getByPlaceholderText("Spitzname"), {
      target: { value: "" },
    });
    fireEvent.change(within(panel).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });
    expect(button).toBeDisabled();
  });

  it("sendet Einladung erfolgreich und leert die Felder (E-Mail versendet)", async () => {
    mockedInviteUser.mockResolvedValue({
      success: true,
      emailSent: true,
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.change(within(panel).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.change(within(panel).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });

    const button = within(panel).getByRole("button", { name: /Einladen/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "alice@example.com",
        nickname: "alice",
        role: "participant",
      });
    });

    await waitFor(() => {
      expect(
        within(panel).getByText(/Einladung per E-Mail gesendet an alice@example.com/i),
      ).toBeInTheDocument();
      // Felder werden geleert
      expect(
        (within(panel).getByPlaceholderText("Spitzname") as HTMLInputElement).value,
      ).toBe("");
      expect(
        (within(panel).getByPlaceholderText("E-Mail") as HTMLInputElement).value,
      ).toBe("");
    });
  });

  it("zeigt eine spezifische Fehlermeldung, wenn der Nickname bereits existiert", async () => {
    mockedInviteUser.mockResolvedValue({
      error: "Nickname already exists",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.change(within(panel).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.change(within(panel).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(within(panel).getByRole("button", { name: /Einladen/i }));

    await waitFor(() => {
      expect(
        within(panel).getByText(/Dieser Spitzname ist bereits vergeben\./i),
      ).toBeInTheDocument();
    });
  });

  it("zeigt eine generische Fehlermeldung bei unerwartetem Fehler", async () => {
    mockedInviteUser.mockRejectedValue(new Error("Network error"));

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.change(within(panel).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.change(within(panel).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(within(panel).getByRole("button", { name: /Einladen/i }));

    await waitFor(() => {
      expect(within(panel).getByText(/Fehler beim Senden/i)).toBeInTheDocument();
    });
  });
});

