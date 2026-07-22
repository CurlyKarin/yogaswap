import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TermDateSelect from "./TermDateSelect";

describe("TermDateSelect", () => {
  afterEach(() => {
    cleanup();
  });

  it("öffnet helle Optionsliste und meldet Auswahl", () => {
    const onChange = vi.fn();
    render(
      <TermDateSelect
        aria-label="Termin wählen"
        value=""
        options={[
          { value: "", label: "Bitte wählen…", disabled: true },
          { value: "a", label: "Termin A" },
          { value: "b", label: "Termin B" },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: /Termin wählen/i });
    expect(trigger).toHaveTextContent("Bitte wählen…");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("term-date-select-list");
    expect(screen.getByRole("option", { name: "Termin A" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Bitte wählen/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Termin B" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
