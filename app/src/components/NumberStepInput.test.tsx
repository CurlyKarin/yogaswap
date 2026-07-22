import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NumberStepInput from "./NumberStepInput";

describe("NumberStepInput", () => {
  afterEach(() => {
    cleanup();
  });

  it("erhöht und verringert mit step und hält min/max ein", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberStepInput value="60" min={0} max={1440} step={15} aria-label="Cutoff" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Erhöhen um 15/i }));
    expect(onChange).toHaveBeenLastCalledWith("75");

    rerender(
      <NumberStepInput value="75" min={0} max={1440} step={15} aria-label="Cutoff" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Verringern um 15/i }));
    expect(onChange).toHaveBeenLastCalledWith("60");
  });

  it("deaktiviert Verringern am Minimum", () => {
    render(<NumberStepInput value="0" min={0} max={90} onChange={vi.fn()} aria-label="Tage" />);
    expect(screen.getByRole("button", { name: /Verringern um 1/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Erhöhen um 1/i })).toBeEnabled();
  });
});
