import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import CourseMembersDialog from "./CourseMembersDialog";
import { getParticipants } from "../api/participants";
import type { CourseEnrollment } from "shared/types";

vi.mock("../api/participants");
const mockedGetParticipants = getParticipants as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockedGetParticipants.mockReset();
});

const defaultProps = {
  saving: false,
  courseId: 7,
  courseName: "Yoga Flow",
  maxCapacity: 10,
  initialParticipants: [] as string[],
  modalRef: createRef<HTMLDivElement>(),
  onKeyDown: vi.fn(),
  onClose: vi.fn(),
  onSaveParticipants: vi.fn(),
};

describe("CourseMembersDialog", () => {
  it("renders nothing when closed", () => {
    render(<CourseMembersDialog open={false} {...defaultProps} />);
    expect(screen.queryByRole("dialog", { name: "Kursmitglieder bearbeiten" })).not.toBeInTheDocument();
  });

  it("renders course info and calls close handler", async () => {
    const onClose = vi.fn();
    mockedGetParticipants.mockResolvedValue([]);
    render(<CourseMembersDialog open {...defaultProps} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Kursmitglieder bearbeiten" })).toBeInTheDocument();
    expect(screen.getByText("Yoga Flow")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows selecting participants and saving in draft", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "bob", status: "invited", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="draft"
        initialParticipants={["alice"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    expect(await screen.findByText("Zugeordnet: 1 / 10")).toBeInTheDocument();
    const listbox = await screen.findByRole("listbox", { name: /teilnehmerliste/i });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: " " });
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(7, ["alice", "bob"]);
  });

  it("prevents selecting above capacity in draft", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "bob", status: "invited", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="draft"
        maxCapacity={1}
        initialParticipants={["alice"]}
      />,
    );

    expect(await screen.findByText("Zugeordnet: 1 / 1")).toBeInTheDocument();
    const listbox = await screen.findByRole("listbox", { name: /teilnehmerliste/i });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: " " });
    expect(screen.getByText(/maximal 1 teilnehmer/i)).toBeInTheDocument();
    expect(screen.getByText(/kapazität erreicht/i)).toBeInTheDocument();
  });

  it("deselects a draft participant from the list", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    const onSaveParticipants = vi.fn();
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="draft"
        maxCapacity={5}
        initialParticipants={["alice"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    const listbox = await screen.findByRole("listbox", { name: /teilnehmerliste/i });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: " " });
    expect(screen.getByText("Zugeordnet: 0 / 5")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(7, []);
  });

  it("keeps listbox connected to keyboard hint via aria-describedby", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(<CourseMembersDialog open {...defaultProps} courseStatus="draft" />);

    const listbox = await screen.findByRole("listbox", { name: /teilnehmerliste/i });
    const hint = screen.getByText(/tastatur: tab zur liste/i);
    expect(listbox).toHaveAttribute("aria-describedby", "course-members-list-hint");
    expect(hint).toHaveAttribute("id", "course-members-list-hint");
  });

  it("groups active members and saves enrollment changes", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "bob", status: "invited", role: "participant", tenantId: "default-tenant" },
      { userId: "cara", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    const enrollments: CourseEnrollment[] = [
      { courseId: 7, userId: "alice", validFrom: "2020-01-01" },
      { courseId: 7, userId: "bob", validFrom: "2099-06-23" },
    ];
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2099-06-16", "2099-06-23"]}
        courseTime="10:00"
        enrollments={enrollments}
        initialParticipants={["alice", "bob"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    expect(await screen.findByText("Teilnehmer 1/10 · 1 kommt neu dazu")).toBeInTheDocument();
    expect(screen.getByLabelText("alice gültig bis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: /weitere mitglieder/i })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("alice gültig bis"), "2020-01-06");
    expect(screen.getByText("Teilnehmer 0/10 · 1 kommt neu dazu")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(
      7,
      ["bob"],
      expect.arrayContaining([
        expect.objectContaining({ userId: "alice", action: "remove", dateIso: "2020-01-06" }),
      ]),
    );
  });

  it("drops an upcoming member without writing an until before validFrom", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "bob", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2099-06-16", "2099-06-23"]}
        courseTime="10:00"
        enrollments={[{ courseId: 7, userId: "bob", validFrom: "2099-06-23" }]}
        initialParticipants={[]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    expect(await screen.findByText("Teilnehmer 0/10 · 1 kommt neu dazu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    expect(screen.queryByLabelText("bob gültig ab")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(
      7,
      [],
      expect.arrayContaining([
        expect.objectContaining({ userId: "bob", action: "remove" }),
      ]),
    );
  });

  it("adds a member from the collapsed lower list with next term as validFrom", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant", email: "alice@studio.test" },
      { userId: "cara", status: "active", role: "participant", tenantId: "default-tenant", email: "cara@studio.test" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2099-06-16"]}
        courseTime="10:00"
        enrollments={[{ courseId: 7, userId: "alice", validFrom: "2026-01-01" }]}
        initialParticipants={["alice"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    expect(await screen.findByRole("button", { name: "Weitere Mitglieder" })).toBeInTheDocument();
    expect(screen.getByText("alice@studio.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /alice bis .* beenden/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Weitere Mitglieder" }));
    expect(screen.getByText("cara@studio.test")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("cara gültig ab"), "2099-06-16");
    expect(screen.getByLabelText("cara gültig bis")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(
      7,
      expect.arrayContaining(["alice", "cara"]),
      expect.arrayContaining([
        expect.objectContaining({ userId: "cara", action: "add", dateIso: "2099-06-16" }),
      ]),
    );
  });

  it("hides incoming members and add actions for inactive courses", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "cara", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="inactive"
        courseDates={["2026-01-06"]}
        enrollments={[
          { courseId: 7, userId: "alice", validFrom: "2026-01-01" },
          { courseId: 7, userId: "bob", validFrom: "2026-09-01" },
        ]}
        initialParticipants={["alice"]}
      />,
    );

    expect(await screen.findByText("Teilnehmer 1/10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /entfernen/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /weitere mitglieder/i }));
    expect(screen.queryByLabelText(/gültig ab/i)).not.toBeInTheDocument();
  });

  it("saves a corrected validUntil on an already closed enrollment", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2099-06-16", "2099-06-23"]}
        courseTime="10:00"
        enrollments={[
          { courseId: 7, userId: "alice", validFrom: "2026-01-01", validUntil: "2099-06-16" },
        ]}
        initialParticipants={["alice"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    const untilSelect = await screen.findByLabelText("alice gültig bis");
    expect(untilSelect).toHaveValue("2099-06-16");
    await userEvent.selectOptions(untilSelect, "2099-06-23");
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(7, ["alice"], [
      { userId: "alice", action: "remove", dateIso: "2099-06-23" },
    ]);
  });

  it("keeps a future validUntil edit when enrollments are replaced", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    const enrollments: CourseEnrollment[] = [
      { courseId: 7, userId: "alice", validFrom: "2026-01-01", validUntil: "2099-06-16" },
    ];
    const view = render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2099-06-16", "2099-06-23"]}
        courseTime="10:00"
        enrollments={enrollments}
        initialParticipants={["alice"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    const untilSelect = await screen.findByLabelText("alice gültig bis");
    await userEvent.selectOptions(untilSelect, "2099-06-23");
    view.rerender(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2099-06-16", "2099-06-23"]}
        courseTime="10:00"
        enrollments={[...enrollments]}
        initialParticipants={["alice"]}
        onSaveParticipants={onSaveParticipants}
      />,
    );
    expect(screen.getByLabelText("alice gültig bis")).toHaveValue("2099-06-23");
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(7, ["alice"], [
      { userId: "alice", action: "remove", dateIso: "2099-06-23" },
    ]);
  });

  it("does not move an active member by clicking the name", async () => {
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2099-06-16"]}
        courseTime="10:00"
        enrollments={[{ courseId: 7, userId: "alice", validFrom: "2026-01-01" }]}
        initialParticipants={["alice"]}
      />,
    );

    expect(await screen.findByText("Teilnehmer 1/10")).toBeInTheDocument();
    await userEvent.click(screen.getByText("alice"));
    expect(screen.getByLabelText("alice gültig bis")).toHaveValue("");
    expect(screen.getByText("Teilnehmer 1/10")).toBeInTheDocument();
  });

  it("shows a former end date as read-only and rejoins via a start date", async () => {
    const onSaveParticipants = vi.fn();
    mockedGetParticipants.mockResolvedValue([
      { userId: "alice", status: "active", role: "participant", tenantId: "default-tenant" },
    ]);
    render(
      <CourseMembersDialog
        open
        {...defaultProps}
        courseStatus="active"
        courseDates={["2020-01-06", "2020-01-13", "2099-06-16"]}
        courseTime="10:00"
        enrollments={[
          { courseId: 7, userId: "alice", validFrom: "2020-01-01", validUntil: "2020-01-06" },
        ]}
        initialParticipants={[]}
        onSaveParticipants={onSaveParticipants}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Weitere Mitglieder" }));
    expect(screen.getByLabelText("alice ehemals bis")).toHaveTextContent("ehemals bis");
    expect(screen.queryByLabelText("alice gültig bis")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("alice gültig ab"), "2099-06-16");
    await userEvent.click(screen.getByRole("button", { name: /mitglieder speichern/i }));
    expect(onSaveParticipants).toHaveBeenCalledWith(
      7,
      ["alice"],
      expect.arrayContaining([
        expect.objectContaining({ userId: "alice", action: "add", dateIso: "2099-06-16" }),
      ]),
    );
  });
});
