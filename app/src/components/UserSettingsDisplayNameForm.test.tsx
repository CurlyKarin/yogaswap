import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSettingsDisplayNameForm from "./UserSettingsDisplayNameForm";
import { updateParticipant } from "../api/participants";

vi.mock("../api/participants", () => ({
  updateParticipant: vi.fn(),
}));

const mockedUpdateParticipant = updateParticipant as unknown as ReturnType<typeof vi.fn>;

describe("UserSettingsDisplayNameForm (#436)", () => {
  beforeEach(() => {
    cleanup();
    mockedUpdateParticipant.mockReset();
  });

  it("speichert Anzeigename und meldet Erfolg inkl. Info-Mail", async () => {
    const user = userEvent.setup();
    const onDisplayNameSaved = vi.fn();
    mockedUpdateParticipant.mockResolvedValue({
      displayName: "Anna",
      displayNameChanged: true,
      displayNameChangedEmailSent: true,
    });

    render(
      <UserSettingsDisplayNameForm
        nickname="Anja"
        displayName="Alt"
        onDisplayNameSaved={onDisplayNameSaved}
      />,
    );

    const input = screen.getByRole("textbox", { name: /^anzeigename$/i });
    await user.clear(input);
    await user.type(input, "Anna");
    await user.click(screen.getByRole("button", { name: /anzeigename speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("Anja", { displayName: "Anna" });
    });
    expect(onDisplayNameSaved).toHaveBeenCalledWith("Anna");
    expect(screen.getByRole("status")).toHaveTextContent(/info-mail/i);
  });

  it("lehnt ungültige Namen ohne API-Call ab", async () => {
    const user = userEvent.setup();
    render(<UserSettingsDisplayNameForm nickname="Anja" displayName="Anna" />);

    const input = screen.getByRole("textbox", { name: /^anzeigename$/i });
    await user.clear(input);
    await user.type(input, "A");
    await user.click(screen.getByRole("button", { name: /anzeigename speichern/i }));

    expect(mockedUpdateParticipant).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/mindestens/i);
  });

  it("zeigt Login-Name schreibgeschützt", () => {
    render(<UserSettingsDisplayNameForm nickname="Anja" displayName="Anna" />);
    const login = screen.getByDisplayValue("Anja");
    expect(login).toHaveAttribute("readonly");
    expect(login).toHaveAttribute("name", "username");
  });
});
