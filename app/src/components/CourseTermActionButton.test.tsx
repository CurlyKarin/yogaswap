import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import CourseTermActionButton from "./CourseTermActionButton";

describe("CourseTermActionButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("setzt aria-label aus Aktion, Kurs und Termin", () => {
    render(
      <CourseTermActionButton
        action="Termin absagen"
        courseName="Yoga Basic"
        termIso="2099-06-16"
        onClick={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Termin absagen, Yoga Basic, 16.06.2099" }),
    ).toBeInTheDocument();
  });

  it("ruft onClick nicht auf, wenn inactive gesetzt ist", () => {
    const onClick = vi.fn();
    render(
      <CourseTermActionButton
        action="Termin absagen"
        courseName="Yoga Basic"
        termIso="2099-06-16"
        inactive
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Termin absagen/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
