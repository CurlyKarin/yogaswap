import { describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import CourseModalFrame from "./CourseModalFrame";

afterEach(() => {
  cleanup();
});

describe("CourseModalFrame", () => {
  it("renders title, aria label, and children", () => {
    const modalRef = createRef<HTMLDivElement>();
    render(
      <CourseModalFrame
        ariaLabel="Test Modal"
        title="Test Titel"
        modalRef={modalRef}
        onKeyDown={vi.fn()}
      >
        <p>Inhalt</p>
      </CourseModalFrame>,
    );

    expect(screen.getByRole("dialog", { name: "Test Modal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Test Titel" })).toBeInTheDocument();
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });

  it("forwards keydown events", () => {
    const onKeyDown = vi.fn();
    const modalRef = createRef<HTMLDivElement>();
    render(
      <CourseModalFrame
        ariaLabel="Test Modal"
        title="Test Titel"
        modalRef={modalRef}
        onKeyDown={onKeyDown}
      >
        <p>Inhalt</p>
      </CourseModalFrame>,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Test Modal" }), { key: "Tab" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
