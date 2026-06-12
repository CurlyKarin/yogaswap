import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminPanelFallback from "./AdminPanelFallback";

describe("AdminPanelFallback", () => {
  it("exposes loading status for screen readers", () => {
    render(<AdminPanelFallback />);

    const status = screen.getByRole("status", { name: /verwaltung wird geladen/i });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveClass("admin-panel-fallback");
  });
});
