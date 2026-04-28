import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DelegationPickerDialog from "./DelegationPickerDialog";

afterEach(() => {
  cleanup();
});

describe("DelegationPickerDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <DelegationPickerDialog
        open={false}
        search=""
        candidates={[]}
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog", { name: /vertretung auswählen/i })).not.toBeInTheDocument();
  });

  it("renders candidates and empty state", () => {
    const { rerender } = render(
      <DelegationPickerDialog
        open
        search=""
        candidates={[
          { userId: "maya", email: "maya@example.com", status: "active", role: "participant", tenantId: "default-tenant" },
        ]}
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: /maya - registriert/i })).toBeInTheDocument();

    rerender(
      <DelegationPickerDialog
        open
        search="zzz"
        candidates={[]}
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/keine passenden teilnehmer gefunden/i)).toBeInTheDocument();
  });

  it("calls onSearchChange when typing", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DelegationPickerDialog
        open
        search=""
        candidates={[]}
        onSearchChange={onSearchChange}
        onSelectUser={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/vertretung suchen/i), "may");
    expect(onSearchChange).toHaveBeenCalled();
  });

  it("supports keyboard navigation and selection", () => {
    const onSelectUser = vi.fn();
    render(
      <DelegationPickerDialog
        open
        search=""
        candidates={[
          { userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" },
          { userId: "luca", status: "invited", role: "participant", tenantId: "default-tenant" },
        ]}
        onSearchChange={vi.fn()}
        onSelectUser={onSelectUser}
        onClose={vi.fn()}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: /vertretungsteilnehmerliste/i });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(onSelectUser).toHaveBeenCalledWith("luca");
  });

  it("closes on Escape and selects on click", async () => {
    const onClose = vi.fn();
    const onSelectUser = vi.fn();
    const user = userEvent.setup();
    render(
      <DelegationPickerDialog
        open
        search=""
        candidates={[{ userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" }]}
        onSearchChange={vi.fn()}
        onSelectUser={onSelectUser}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("option", { name: /maya - registriert/i }));
    expect(onSelectUser).toHaveBeenCalledWith("maya");

    fireEvent.keyDown(screen.getByRole("dialog", { name: /vertretung auswählen/i }), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps listbox connected to keyboard hint via aria-describedby", () => {
    render(
      <DelegationPickerDialog
        open
        search=""
        candidates={[{ userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" }]}
        onSearchChange={vi.fn()}
        onSelectUser={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: /vertretungsteilnehmerliste/i });
    const hint = screen.getByText(/tastatur: tab zur liste/i);
    expect(listbox).toHaveAttribute("aria-describedby", "delegation-list-hint");
    expect(hint).toHaveAttribute("id", "delegation-list-hint");
  });
});
