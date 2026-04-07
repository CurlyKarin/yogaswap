import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ForgotPassword from "./ForgotPassword";
import { confirmResetPassword, resetPassword, signOut } from "aws-amplify/auth";
import { clearCurrentUser } from "shared/lib/storage";

vi.mock("aws-amplify/auth", () => ({
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("shared/lib/storage", () => ({
  clearCurrentUser: vi.fn(),
}));

const mockedResetPassword = resetPassword as unknown as ReturnType<typeof vi.fn>;
const mockedConfirmResetPassword = confirmResetPassword as unknown as ReturnType<typeof vi.fn>;
const mockedSignOut = signOut as unknown as ReturnType<typeof vi.fn>;
const mockedClearCurrentUser = clearCurrentUser as unknown as ReturnType<typeof vi.fn>;

function renderWithRouter(initialEntries: string[] = ["/forgot-password"]) {
  const utils = render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<div>Login-Seite</div>} />
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
    mockedSignOut.mockResolvedValue(undefined);
  });

  it("fordert einen Reset-Code an", async () => {
    const { page } = renderWithRouter();

    mockedResetPassword.mockResolvedValue({
      nextStep: {
        resetPasswordStep: "CONFIRM_RESET_PASSWORD_WITH_CODE",
      },
    });

    fireEvent.change(within(page).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Code anfordern/i }));

    await waitFor(() => {
      expect(mockedResetPassword).toHaveBeenCalledWith({ username: "alice" });
      expect(within(page).getByPlaceholderText("Code aus E-Mail")).toBeInTheDocument();
      expect(within(page).getByPlaceholderText("Neues Passwort")).toBeInTheDocument();
    });
  });

  it("setzt ein neues Passwort mit Code", async () => {
    mockedResetPassword.mockResolvedValue({});
    mockedConfirmResetPassword.mockResolvedValue({});

    const { page } = renderWithRouter();

    fireEvent.change(within(page).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Code anfordern/i }));

    await waitFor(() => {
      expect(within(page).getByPlaceholderText("Code aus E-Mail")).toBeInTheDocument();
    });

    fireEvent.change(within(page).getByPlaceholderText("Code aus E-Mail"), {
      target: { value: "123456" },
    });
    fireEvent.change(within(page).getByPlaceholderText("Neues Passwort"), {
      target: { value: "SicheresPasswort123!" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Neues Passwort setzen/i }));

    await waitFor(() => {
      expect(mockedConfirmResetPassword).toHaveBeenCalledWith({
        username: "alice",
        confirmationCode: "123456",
        newPassword: "SicheresPasswort123!",
      });
      expect(mockedSignOut).toHaveBeenCalled();
      expect(mockedClearCurrentUser).toHaveBeenCalled();
    });
  });
});
