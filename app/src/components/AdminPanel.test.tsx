import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import AdminPanel from "./AdminPanel";
import { getParticipants, inviteUser } from "../api/participants";

vi.mock("../api/participants", () => ({
  inviteUser: vi.fn(),
  getParticipants: vi.fn(),
  updateParticipant: vi.fn(),
}));

const mockedInviteUser = inviteUser as unknown as ReturnType<typeof vi.fn>;
const mockedGetParticipants = getParticipants as unknown as ReturnType<typeof vi.fn>;

describe("AdminPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetParticipants.mockResolvedValue([]);
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

  it("ermöglicht fremdverwaltete Teilnehmer ohne E-Mail (ohne Login) und ruft inviteUser ohne email auf", async () => {
    mockedInviteUser.mockResolvedValue({
      success: true,
      emailSent: false,
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(
      within(panel).getByRole("checkbox", {
        name: /Teilnehmer ohne Login anlegen/i,
      }),
    );

    fireEvent.change(within(panel).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });

    // E-Mail Feld ist ausgeblendet
    expect(within(panel).queryByPlaceholderText("E-Mail")).toBeNull();

    // Rolle ist deaktiviert (fix auf participant)
    const roleSelect = within(panel).getByRole("combobox");
    expect(roleSelect).toBeDisabled();

    const button = within(panel).getByRole("button", { name: /Anlegen/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        nickname: "alice",
        role: "participant",
      });
    });

    await waitFor(() => {
      expect(
        within(panel).getByText(/wurde ohne Login angelegt/i),
      ).toBeInTheDocument();
    });
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

  it("lädt Teilnehmerliste für die Verwaltung", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
      expect(within(panel).getByText("Teilnehmerin")).toBeInTheDocument();
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
      expect(within(panel).getByLabelText("Status: ohne Login")).toBeInTheDocument();
      expect(within(panel).getByLabelText("Bearbeiten alice")).toBeDisabled();
      expect(within(panel).getByLabelText("Löschen alice")).toBeDisabled();
    });
  });
});

