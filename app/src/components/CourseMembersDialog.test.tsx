import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import CourseMembersDialog from "./CourseMembersDialog";

describe("CourseMembersDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <CourseMembersDialog
        open={false}
        saving={false}
        courseName="Yoga Flow"
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Kursmitglieder bearbeiten" })).not.toBeInTheDocument();
  });

  it("renders course info and calls close handler", async () => {
    const onClose = vi.fn();
    render(
      <CourseMembersDialog
        open
        saving={false}
        courseName="Yoga Flow"
        modalRef={createRef<HTMLDivElement>()}
        onKeyDown={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Kursmitglieder bearbeiten" })).toBeInTheDocument();
    expect(screen.getByText("Yoga Flow")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
