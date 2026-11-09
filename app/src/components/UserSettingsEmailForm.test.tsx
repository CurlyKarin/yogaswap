import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSettingsEmailForm from "./UserSettingsEmailForm";
import { updateParticipant } from "../api/participants";

vi.mock("../api/participants", () => ({
  updateParticipant: vi.fn(),
}));

const mockedUpdateParticipant = updateParticipant as unknown as ReturnType<typeof vi.fn>;

describe("UserSettingsEmailForm (#435)", () => {
  beforeEach(() => {
    cleanup();
    mockedUpdateParticipant.mockReset();
  });

  it("speichert E-Mail und triggert Reauth bei passwordResetTriggered", async () => {
    const user = userEvent.setup();
    const onRequiresReauth = vi.fn().mockResolvedValue(undefined);
    mockedUpdateParticipant.mockResolvedValue({
      email: "neu@example.com",
      passwordResetTriggered: true,
    });

    render(
      <UserSettingsEmailForm
        nickname="maya"
        email="alt@example.com"
        onRequiresReauth={onRequiresReauth}
      />,
    );

    const input = screen.getByRole("textbox", { name: /e-mail-adresse/i });
    await user.clear(input);
    await user.type(input, "neu@example.com");
    await user.click(screen.getByRole("button", { name: /e-mail speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("maya", { email: "neu@example.com" });
    });
    expect(onRequiresReauth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/abgemeldet/i);
  });

  it("lehnt ungültige Adresse ab ohne API-Call", async () => {
    const user = userEvent.setup();
    const onRequiresReauth = vi.fn();

    render(
      <UserSettingsEmailForm
        nickname="maya"
        email="alt@example.com"
        onRequiresReauth={onRequiresReauth}
      />,
    );

    const input = screen.getByRole("textbox", { name: /e-mail-adresse/i });
    await user.clear(input);
    await user.type(input, "keine-mail");
    await user.click(screen.getByRole("button", { name: /e-mail speichern/i }));

    expect(mockedUpdateParticipant).not.toHaveBeenCalled();
    expect(onRequiresReauth).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/gültige e-mail/i);
  });

  it("deaktiviert Speichern bei unveränderter Adresse", () => {
    render(
      <UserSettingsEmailForm
        nickname="maya"
        email="alt@example.com"
        onRequiresReauth={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /e-mail speichern/i })).toBeDisabled();
  });
});
