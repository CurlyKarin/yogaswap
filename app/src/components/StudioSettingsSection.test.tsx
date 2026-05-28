import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import StudioSettingsSection from "./StudioSettingsSection";
import { updateTenantSettings } from "../api/tenantSettings";
import type { Tenant } from "shared/types";

vi.mock("../api/tenantSettings", () => ({
  updateTenantSettings: vi.fn(),
}));

const mockedUpdateTenantSettings = updateTenantSettings as unknown as ReturnType<typeof vi.fn>;

function makeTenant(settings: Tenant["settings"] = {}): Tenant {
  return {
    tenantId: "default-tenant",
    name: "Yoga Studio",
    settings,
  };
}

function getCutoffInput(): HTMLInputElement {
  const input = document.querySelector(
    'input[type="number"][min="0"][max="1440"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error("Cutoff input not found");
  return input;
}

describe("StudioSettingsSection", () => {
  beforeEach(() => {
    mockedUpdateTenantSettings.mockReset();
    cleanup();
  });

  it("zeigt das Cutoff-Feld mit Defaultwert 60", () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    const cutoffInput = getCutoffInput();
    expect(cutoffInput).toHaveValue(60);
  });

  it("zeigt den geladenen Cutoff-Wert aus Tenant-Settings", () => {
    render(
      <StudioSettingsSection
        tenant={makeTenant({ cancellationSwapCutoffMinutesBeforeStart: 30 })}
        onSaved={vi.fn()}
      />,
    );
    const cutoffInput = getCutoffInput();
    expect(cutoffInput).toHaveValue(30);
  });

  it("sendet Cutoff-Wert beim Speichern korrekt im Patch", async () => {
    const onSaved = vi.fn();
    const updatedTenant = makeTenant({ cancellationSwapCutoffMinutesBeforeStart: 45 });
    mockedUpdateTenantSettings.mockResolvedValue(updatedTenant);
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={onSaved} />);

    fireEvent.change(getCutoffInput(), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /studio-einstellungen speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateTenantSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          cancellationSwapCutoffMinutesBeforeStart: 45,
        }),
      );
    });
    expect(onSaved).toHaveBeenCalledWith(updatedTenant);
  });

  it("zeigt Validierungsfehler bei ungültigem Cutoff-Wert", async () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    fireEvent.change(getCutoffInput(), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: /studio-einstellungen speichern/i }));

    expect(
      await screen.findByText(
        "Kurzfrist-Absage: Minuten vor Terminbeginn müssen eine ganze Zahl zwischen 0 und 1440 sein.",
      ),
    ).toBeInTheDocument();
    expect(mockedUpdateTenantSettings).not.toHaveBeenCalled();
  });
});
