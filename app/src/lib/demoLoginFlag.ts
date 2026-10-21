/** Build-time flag: only demo may embed Luna-Vorbefüllung (#100 / #392). Staging/Prod: unset/false. */
export const SHOW_DEMO_LOGIN = import.meta.env.VITE_SHOW_DEMO_LOGIN === "true";

export function isDemoLoginEnabled(): boolean {
  return SHOW_DEMO_LOGIN;
}
