import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ForgotPassword from "./ForgotPassword";
import { requestSelfPasswordReset } from "../api/auth";

vi.mock("../api/auth", () => ({
  requestSelfPasswordReset: vi.fn(),
}));

const mockedRequestSelfPasswordReset = requestSelfPasswordReset as unknown as ReturnType<
  typeof vi.fn
>;

function renderWithRouter(initialEntries: string[] = ["/forgot-password"]) {
  function LoginStateProbe() {
    const location = useLocation();
    const state = location.state as {
      info?: string;
      prefillUsername?: string;
      prefillPassword?: string;
    } | null;
    return (
      <div>
        <div>Login-Seite</div>
        <div data-testid="login-prefill">{state?.prefillUsername ?? ""}</div>
        <div data-testid="login-prefill-password">{state?.prefillPassword ?? ""}</div>
      </div>
    );
  }
  const utils = render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<LoginStateProbe />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const page =
    (utils.container.querySelector(".auth-form") as HTMLElement | null) ??
    utils.container;
  return { ...utils, page };
}

describe("ForgotPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fordert einen Reset-Link an", async () => {
    const { page } = renderWithRouter();

    mockedRequestSelfPasswordReset.mockResolvedValue({ success: true, emailSent: true });

    fireEvent.change(within(page).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Reset-Link anfordern/i }));

    await waitFor(() => {
      expect(mockedRequestSelfPasswordReset).toHaveBeenCalledWith({ nickname: "alice" });
      expect(within(page).getByText(/Reset-Link per E-Mail versendet/i)).toBeInTheDocument();
      expect(within(page).getByRole("button", { name: /Link erneut senden/i })).toBeInTheDocument();
    });
  });

  it("zeigt Rate-Limit-Feedback bei zu vielen Anfragen", async () => {
    mockedRequestSelfPasswordReset.mockRejectedValue(new Error("TooManyRequestsException"));
    const { page } = renderWithRouter();

    fireEvent.change(within(page).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Reset-Link anfordern/i }));

    await waitFor(() => {
      expect(
        within(page).getByText(/Zu viele Anfragen\. Bitte warte kurz/i),
      ).toBeInTheDocument();
    });
  });

  it("zeigt Link zur Anmeldung", async () => {
    const { page } = renderWithRouter();

    await waitFor(() => {
      expect(within(page).getByRole("link", { name: /Zur Anmeldung/i })).toBeInTheDocument();
    });
  });
});
