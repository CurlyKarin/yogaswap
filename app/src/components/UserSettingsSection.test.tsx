import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSettingsSection from "./UserSettingsSection";

describe("UserSettingsSection (#433)", () => {
  beforeEach(() => {
    cleanup();
  });

  it("zeigt die Settings-Hülle zugeklappt mit Platzhalter-Sektionen", () => {
    render(<UserSettingsSection nickname="Maya" />);

    const region = screen.getByRole("region", { name: /meine einstellungen/i });
    expect(region).toHaveAttribute("id", "user-settings");

    const details = region.querySelector("details.studio-settings-details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(false);

    expect(screen.getByRole("heading", { level: 4, name: /^profil$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /^sicherheit$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: /e-mail-benachrichtigungen/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /^warteliste$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /^darstellung$/i })).toBeInTheDocument();

    expect(screen.getByText(/maya/i)).toBeInTheDocument();
    expect(screen.queryByText(/studio verlassen|konto löschen/i)).not.toBeInTheDocument();
  });

  it("öffnet kontrolliert und meldet onOpenChange", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <UserSettingsSection nickname="Maya" open={false} onOpenChange={onOpenChange} />,
    );

    const region = screen.getByRole("region", { name: /meine einstellungen/i });
    const details = region.querySelector("details.studio-settings-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    await user.click(screen.getByRole("heading", { level: 3, name: /meine einstellungen/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(<UserSettingsSection nickname="Maya" open={true} onOpenChange={onOpenChange} />);
    expect(details.open).toBe(true);
  });
});
