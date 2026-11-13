import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSettingsWaitlistForm from "./UserSettingsWaitlistForm";

vi.mock("../api/participants", () => ({
  updateParticipant: vi.fn(),
}));

describe("UserSettingsWaitlistForm (#438)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("zeigt Studio-Absagefrist als Minimum und Default", () => {
    render(<UserSettingsWaitlistForm nickname="Maya" studioCutoffMinutes={60} />);

    expect(screen.getByRole("spinbutton", { name: /wartelisten-zeitpuffer/i })).toHaveValue(60);
    expect(screen.getByText(/studio-absagefrist \(1 std\.\)/i)).toBeInTheDocument();
  });

  it("speichert verlängerten Puffer", async () => {
    const user = userEvent.setup();
    const { updateParticipant } = await import("../api/participants");
    vi.mocked(updateParticipant).mockResolvedValue({
      userId: "Maya",
      status: "active",
      settings: { waitlistNoPromoteWithinMinutes: 120 },
    } as Awaited<ReturnType<typeof updateParticipant>>);

    const onSaved = vi.fn();
    render(
      <UserSettingsWaitlistForm
        nickname="Maya"
        studioCutoffMinutes={60}
        waitlistNoPromoteWithinMinutes={60}
        onWaitlistBufferSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: /erhöhen um 15/i }));
    await user.click(screen.getByRole("button", { name: /erhöhen um 15/i }));
    await user.click(screen.getByRole("button", { name: /erhöhen um 15/i }));
    await user.click(screen.getByRole("button", { name: /erhöhen um 15/i }));
    // 60 → 75 → 90 → 105 → 120
    await user.click(screen.getByRole("button", { name: /wartelisten-puffer speichern/i }));

    expect(updateParticipant).toHaveBeenCalledWith("Maya", {
      settings: { waitlistNoPromoteWithinMinutes: 120 },
    });
    expect(onSaved).toHaveBeenCalledWith(120);
  });
});
