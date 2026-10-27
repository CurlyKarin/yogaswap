import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
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

function getStudioDetails(): HTMLDetailsElement {
  const heading = screen.getByRole("heading", { level: 3, name: /studio-einstellungen/i });
  const details = heading.closest("details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error("Studio settings details not found");
  }
  return details;
}

function getSubdetails(name: RegExp): HTMLDetailsElement {
  const heading = screen.getByRole("heading", { level: 4, name });
  const details = heading.closest("details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error(`Studio settings subdetails not found: ${name}`);
  }
  return details;
}

function getRollingDetails(): HTMLDetailsElement {
  return getSubdetails(/durchlaufende kurse/i);
}

function getNotificationsDetails(): HTMLDetailsElement {
  return getSubdetails(/e-mail-benachrichtigungen/i);
}

function expandStudioSettings() {
  const details = getStudioDetails();
  if (!details.open) {
    fireEvent.click(details.querySelector("summary")!);
  }
}

function expandSubdetails(getDetails: () => HTMLDetailsElement) {
  expandStudioSettings();
  const details = getDetails();
  if (!details.open) {
    fireEvent.click(details.querySelector("summary")!);
  }
}

function expandRollingCourses() {
  expandSubdetails(getRollingDetails);
}

function expandNotifications() {
  expandSubdetails(getNotificationsDetails);
}

describe("StudioSettingsSection", () => {
  beforeEach(() => {
    mockedUpdateTenantSettings.mockReset();
    cleanup();
  });

  it("klappt Studio-Einstellungen und Unterabschnitte standardmäßig zu", () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expect(getStudioDetails().open).toBe(false);
    expect(screen.getByRole("textbox", { name: /studioname/i })).not.toBeVisible();

    expandStudioSettings();
    expect(getStudioDetails().open).toBe(true);
    expect(getNotificationsDetails().open).toBe(false);
    expect(getRollingDetails().open).toBe(false);
    expect(
      screen.getByRole("checkbox", {
        name: /kursleitung bei stamm-änderungen informieren/i,
      }),
    ).not.toBeVisible();
    expect(screen.getByLabelText(/nachlauf nach kursende/i)).not.toBeVisible();
  });

  it("zeigt das Cutoff-Feld mit Defaultwert 60", () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expandStudioSettings();
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
    expandStudioSettings();
    const cutoffInput = getCutoffInput();
    expect(cutoffInput).toHaveValue(30);
  });

  it("sendet Cutoff-Wert beim Speichern korrekt im Patch", async () => {
    const onSaved = vi.fn();
    const updatedTenant = makeTenant({ cancellationSwapCutoffMinutesBeforeStart: 45 });
    mockedUpdateTenantSettings.mockResolvedValue(updatedTenant);
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={onSaved} />);
    expandStudioSettings();

    fireEvent.change(getCutoffInput(), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /studio-einstellungen speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateTenantSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Yoga Studio",
          cancellationSwapCutoffMinutesBeforeStart: 45,
          inactiveGraceDaysAfterCourseEnd: 7,
          minOffsetDays: -7,
          maxOffsetDays: 7,
          rollingPlanningHorizonWeeks: 5,
          notifyInstructorsOnStemChange: false,
          notifyInstructorsOnTermParticipationChange: false,
          instructorTermNotifyFromHoursBeforeStart: null,
          instructorTermNotifyUntilMinutesBeforeStart: null,
        }),
      );
    });
    expect(onSaved).toHaveBeenCalledWith(updatedTenant);
  });

  it("sendet Stamm-Mitteilung an Kursleitung im Patch (#398)", async () => {
    const onSaved = vi.fn();
    mockedUpdateTenantSettings.mockResolvedValue(
      makeTenant({ notifyInstructorsOnStemChange: true }),
    );
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={onSaved} />);
    expandNotifications();

    const checkbox = screen.getByRole("checkbox", {
      name: /kursleitung bei stamm-änderungen informieren/i,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /studio-einstellungen speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateTenantSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notifyInstructorsOnStemChange: true }),
      );
    });
  });

  it("sendet Termin-Teilnahme-Mitteilung inkl. Zeitfenster im Patch (#398)", async () => {
    mockedUpdateTenantSettings.mockResolvedValue(
      makeTenant({
        notifyInstructorsOnTermParticipationChange: true,
        instructorTermNotifyFromHoursBeforeStart: 24,
        instructorTermNotifyUntilMinutesBeforeStart: 60,
      }),
    );
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expandNotifications();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /kursleitung bei termin-teilnahmeänderungen informieren/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /startzeitraum begrenzen/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /bis-zeitraum begrenzen/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /studio-einstellungen speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateTenantSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyInstructorsOnTermParticipationChange: true,
          instructorTermNotifyFromHoursBeforeStart: 24,
          instructorTermNotifyUntilMinutesBeforeStart: 60,
        }),
      );
    });
  });

  it("stellt Landmark und beschriftete Formularfelder bereit", () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expect(screen.getByRole("region", { name: /studio-einstellungen/i })).toBeInTheDocument();
    expandStudioSettings();
    expect(screen.getByRole("textbox", { name: /studioname/i })).toBeVisible();
  });

  it("gruppiert Felder in Allgemein, E-Mail-Benachrichtigungen und Durchlaufende Kurse", () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expandNotifications();
    expandRollingCourses();

    expect(screen.getByRole("heading", { level: 4, name: /allgemein/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: /e-mail-benachrichtigungen/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: /durchlaufende kurse/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /allgemein/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /e-mail-benachrichtigungen/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /durchlaufende kurse/i })).toBeInTheDocument();

    const generalGroup = screen.getByRole("group", { name: /allgemein/i });
    expect(generalGroup).toContainElement(screen.getByRole("textbox", { name: /studioname/i }));
    expect(generalGroup).toContainElement(getCutoffInput());
    expect(generalGroup).not.toContainElement(
      screen.getByRole("checkbox", {
        name: /kursleitung bei stamm-änderungen informieren/i,
      }),
    );

    const notificationsGroup = screen.getByRole("group", { name: /e-mail-benachrichtigungen/i });
    expect(notificationsGroup).toContainElement(
      within(notificationsGroup).getByRole("checkbox", {
        name: /kursleitung bei stamm-änderungen informieren/i,
      }),
    );

    const rollingGroup = screen.getByRole("group", { name: /durchlaufende kurse/i });
    expect(rollingGroup).toContainElement(
      within(rollingGroup).getByLabelText(/nachlauf nach kursende/i),
    );
    expect(rollingGroup).toContainElement(
      within(rollingGroup).getByLabelText(/tauschfenster: frühestens/i),
    );
    expect(rollingGroup).not.toContainElement(getCutoffInput());
  });

  it("erhöht Absagefrist in 15-Minuten-Schritten", () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expandStudioSettings();
    expect(getCutoffInput()).toHaveValue(60);
    fireEvent.click(screen.getByRole("button", { name: /Erhöhen um 15/i }));
    expect(getCutoffInput()).toHaveValue(75);
  });

  it("zeigt Validierungsfehler bei ungültigem Cutoff-Wert", async () => {
    render(<StudioSettingsSection tenant={makeTenant()} onSaved={vi.fn()} />);
    expandStudioSettings();
    fireEvent.change(getCutoffInput(), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: /studio-einstellungen speichern/i }));

    expect(
      await screen.findByText(
        "Absagefrist für Mitglieder muss eine ganze Zahl zwischen 0 und 1440 sein.",
      ),
    ).toBeInTheDocument();
    expect(mockedUpdateTenantSettings).not.toHaveBeenCalled();
  });
});
