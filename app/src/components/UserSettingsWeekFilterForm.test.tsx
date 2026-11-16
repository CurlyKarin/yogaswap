import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateParticipant } from "../api/participants";
import UserSettingsWeekFilterForm from "./UserSettingsWeekFilterForm";

vi.mock("../api/participants", () => ({
  updateParticipant: vi.fn(),
}));

describe("UserSettingsWeekFilterForm (#439)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("nutzt Rollen-Default wenn keine Pref gesetzt ist", () => {
    render(
      <UserSettingsWeekFilterForm nickname="alice" role="participant" />,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("speichert persönliche Pref", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(updateParticipant).mockResolvedValue({
      userId: "alice",
      settings: { weekFilterOnlyMyCoursesDefault: false },
    } as Awaited<ReturnType<typeof updateParticipant>>);

    render(
      <UserSettingsWeekFilterForm
        nickname="alice"
        role="participant"
        weekFilterOnlyMyCoursesDefault={true}
        onWeekFilterDefaultSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: /wochenfilter-default speichern/i }),
    );

    expect(updateParticipant).toHaveBeenCalledWith("alice", {
      settings: { weekFilterOnlyMyCoursesDefault: false },
    });
    expect(onSaved).toHaveBeenCalledWith(false);
    expect(await screen.findByRole("status")).toHaveTextContent(/gespeichert/i);
  });
});
