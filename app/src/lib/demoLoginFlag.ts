/** Demo/Staging: VITE_SHOW_DEMO_LOGIN=true. Prod: unset/false (#100). */
export function isDemoLoginEnabled(): boolean {
  return import.meta.env.VITE_SHOW_DEMO_LOGIN === "true";
}
