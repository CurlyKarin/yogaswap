type LayoutDebugOptions = {
  hostname?: string;
  search?: string;
  /** Default: import.meta.env.DEV */
  dev?: boolean;
  /** Default: import.meta.env.VITE_LAYOUT_DEBUG */
  envFlag?: string | undefined;
  /** Default: import.meta.env.MODE — in Vitest „test“ → Banner aus. */
  mode?: string;
};

/**
 * Layout-Diagnosebanner #409:
 * Staging/localhost/DEV, oder ?layoutDebug=1 / VITE_LAYOUT_DEBUG=1.
 * Nicht auf Prod (außer explizitem Flag). Wegklicken schließt für die Session.
 */
export function isLayoutDebugEnabled(options: LayoutDebugOptions = {}): boolean {
  const hostname =
    options.hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const search = options.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const dev = options.dev ?? import.meta.env.DEV;
  const envFlag = options.envFlag ?? import.meta.env.VITE_LAYOUT_DEBUG;
  const mode = options.mode ?? import.meta.env.MODE;

  if (mode === "test") return false;
  if (envFlag === "1") return true;
  try {
    if (new URLSearchParams(search).get("layoutDebug") === "1") return true;
  } catch {
    /* ignore */
  }
  if (hostname.includes("staging") || hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }
  return Boolean(dev);
}
