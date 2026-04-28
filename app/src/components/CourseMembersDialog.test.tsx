import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import CourseMembersDialog from "./CourseMembersDialog";
import { getParticipants } from "../api/participants";

vi.mock("../api/participants");
const mockedGetParticipants = getParticipants as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockedGetParticipants.mockReset();
});

describe("CourseMembersDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <CourseMembersDialog
        open={false}
        saving={false}
        courseId={1}
        courseName="Yoga Flow"
        capacity={10}
        initialParticipants={[]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
        onSaveParticipants={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Kursmitglieder bearbeiten" })).not.toBeInTheDocument();
  });

  it("renders course info and calls close handler", async () => {
    const onClose = vi.fn();
    mockedGetParticipants.mockResolvedValue([]);
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseId={1}
        courseName="Yoga Flow"
        capacity={10}
        initialParticipants={[]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={onClose}
        onSaveParticipants={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Kursmitglieder bearbeiten" })).toBeInTheDocument();
    expect(screen.getByText("Yoga Flow")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows selecting participants and saving", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "bob", status: "invited", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseId={7}
        courseName="Yoga Flow"
        capacity={10}
        initialParticipants={["alice"]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    const listbox = await screen.findByRole("listbox", { name: /teilnehmerliste/i });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: " " });
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(7, ["alice", "bob"]);
  });

  it("prevents selecting above capacity and shows selected list", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "bob", status: "invited", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseId={7}
        courseName="Yoga Flow"
        capacity={1}
        initialParticipants={["alice"]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
        onSaveParticipants={vi.fn()}
      />,
    );

    expect(await screen.findByText(/ausgewählte teilnehmer/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /teilnehmer zum entfernen markieren alice/i })).toBeInTheDocument();
    const bobOption = await screen.findByRole("option", { name: /bob - eingeladen/i });
    await userEvent.click(bobOption);
    await userEvent.click(bobOption);
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(screen.getByRole("button", { name: /teilnehmer zum entfernen markieren alice/i })).toBeInTheDocument();
    expect(screen.getByText(/kapazität erreicht/i)).toBeInTheDocument();
  });

  it("removes selected participant on second click", async () => {
    mockedGetParticipants.mockResolvedValue([{ userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" }]);
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseId={7}
        courseName="Yoga Flow"
        capacity={5}
        initialParticipants={["alice"]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
        onSaveParticipants={vi.fn()}
      />,
    );

    const chip = await screen.findByRole("button", { name: /teilnehmer zum entfernen markieren alice/i });
    await userEvent.click(chip);
    expect(screen.getByRole("button", { name: /teilnehmer jetzt entfernen alice/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /teilnehmer jetzt entfernen alice/i }));
    expect(screen.getByText(/noch keine teilnehmer ausgewählt/i)).toBeInTheDocument();
  });

  it("clears armed remove state when clicking outside chip", async () => {
    mockedGetParticipants.mockResolvedValue([{ userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" }]);
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseId={7}
        courseName="Yoga Flow"
        capacity={5}
        initialParticipants={["alice"]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
        onSaveParticipants={vi.fn()}
      />,
    );

    const chip = await screen.findByRole("button", { name: /teilnehmer zum entfernen markieren alice/i });
    await userEvent.click(chip);
    expect(screen.getByRole("button", { name: /teilnehmer jetzt entfernen alice/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /abbrechen/i }));
    expect(screen.getByRole("button", { name: /teilnehmer zum entfernen markieren alice/i })).toBeInTheDocument();
  });

  it("clears armed remove state when focus moves away from chip", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "bob", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseId={7}
        courseName="Yoga Flow"
        capacity={5}
        initialParticipants={["alice", "bob"]}
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
        onSaveParticipants={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: /teilnehmer zum entfernen markieren alice/i });
    const aliceChip = screen.getByRole("button", { name: /teilnehmer zum entfernen markieren alice/i });
    const searchInput = screen.getByRole("textbox", { name: /mitglieder suchen/i });

    await userEvent.click(aliceChip);
    expect(screen.getByRole("button", { name: /teilnehmer jetzt entfernen alice/i })).toBeInTheDocument();

    searchInput.focus();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /teilnehmer zum entfernen markieren alice/i })).toBeInTheDocument();
    });
  });
});
