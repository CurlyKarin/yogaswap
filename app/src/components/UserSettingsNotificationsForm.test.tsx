import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSettingsNotificationsForm from "./UserSettingsNotificationsForm";

vi.mock("../api/participants", () => ({
  updateParticipant: vi.fn(),
}));

describe("UserSettingsNotificationsForm (#437)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("zeigt drei Schalter mit Hilfe-Tooltips (Defaults an)", async () => {
    const user = userEvent.setup();
    render(<UserSettingsNotificationsForm nickname="Maya" />);

    expect(screen.getByRole("checkbox", { name: /mitteilungen vom studio/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /meine terminänderungen/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /nachrücken/i })).toBeChecked();

    const helpButtons = screen.getAllByRole("button", { name: /^hilfe:/i });
    expect(helpButtons).toHaveLength(3);

    await user.click(helpButtons[0]!);
    expect(screen.getByRole("note")).toHaveTextContent(/kursausfall/i);
    expect(screen.getByText(/zugangs- und security-mails sind immer aktiviert/i)).toBeInTheDocument();
  });

  it("speichert Opt-outs über updateParticipant", async () => {
    const user = userEvent.setup();
    const { updateParticipant } = await import("../api/participants");
    vi.mocked(updateParticipant).mockResolvedValue({
      userId: "Maya",
      status: "active",
      settings: {
        notifications: {
          studioCourseEmail: false,
          ownTermChangeEmail: true,
          waitlistPromotionEmail: true,
        },
      },
    } as Awaited<ReturnType<typeof updateParticipant>>);

    const onSaved = vi.fn();
    render(
      <UserSettingsNotificationsForm
        nickname="Maya"
        notificationSettings={{ studioCourseEmail: true }}
        onNotificationSettingsSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /mitteilungen vom studio/i }));
    await user.click(screen.getByRole("button", { name: /benachrichtigungen speichern/i }));

    expect(updateParticipant).toHaveBeenCalledWith("Maya", {
      settings: {
        notifications: {
          studioCourseEmail: false,
          ownTermChangeEmail: true,
          waitlistPromotionEmail: true,
        },
      },
    });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/gespeichert/i);
  });
});
