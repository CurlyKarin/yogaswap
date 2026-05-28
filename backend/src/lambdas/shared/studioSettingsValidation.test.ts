import { validateStudioSettingsPatch } from "./studioSettingsValidation";

describe("validateStudioSettingsPatch", () => {
  it("akzeptiert cutoff im erlaubten Bereich", () => {
    expect(validateStudioSettingsPatch({ cancellationSwapCutoffMinutesBeforeStart: 0 })).toBeNull();
    expect(validateStudioSettingsPatch({ cancellationSwapCutoffMinutesBeforeStart: 1440 })).toBeNull();
    expect(validateStudioSettingsPatch({ cancellationSwapCutoffMinutesBeforeStart: 60 })).toBeNull();
  });

  it("liefert Fehler bei cutoff außerhalb 0..1440", () => {
    expect(validateStudioSettingsPatch({ cancellationSwapCutoffMinutesBeforeStart: -1 })).toBe(
      "Kurzfrist-Absage: Minuten vor Terminbeginn müssen eine ganze Zahl zwischen 0 und 1440 sein.",
    );
    expect(validateStudioSettingsPatch({ cancellationSwapCutoffMinutesBeforeStart: 1441 })).toBe(
      "Kurzfrist-Absage: Minuten vor Terminbeginn müssen eine ganze Zahl zwischen 0 und 1440 sein.",
    );
  });

  it("liefert Fehler bei nicht-ganzzahligem cutoff", () => {
    expect(validateStudioSettingsPatch({ cancellationSwapCutoffMinutesBeforeStart: 30.5 })).toBe(
      "Kurzfrist-Absage: Minuten vor Terminbeginn müssen eine ganze Zahl zwischen 0 und 1440 sein.",
    );
  });
});
