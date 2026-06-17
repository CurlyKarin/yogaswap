/** Hinweise vor Absenden einer Wartelisten-Tauschanfrage (requestSwap). */
export const SWAP_REQUEST_WARNINGS = [
  "Der Tausch kann jederzeit automatisch ausgeführt werden — womit du dann gleichzeitig von deinem aktuellen Termin abgemeldet wirst.",
  "Eine Rücknahme ist danach nur noch eingeschränkt möglich.",
  "Du erhältst eine E-Mail-Benachrichtigung, wenn der Tausch ausgeführt wurde.",
] as const;

/** Hinweise vor sofortigem Tausch auf einen freien Termin (confirmSwap). */
export const DIRECT_SWAP_WARNINGS = [
  "Der Tausch wird mit der Bestätigung sofort ausgeführt — du meldest dich gleichzeitig von deinem aktuellen Termin ab.",
  "Eine Rücknahme ist danach nur noch eingeschränkt möglich.",
] as const;
