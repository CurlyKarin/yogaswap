import { DEFAULT_TENANT_ID } from "./types";

export type ResolveTenantIdFromHostnameOptions = {
  /** Fallback wenn Apex / localhost / kein Multi-Tenant-Parent (Default: default-tenant). */
  fallbackTenantId?: string;
  /**
   * Parent-Host für Multi-Tenant-Subdomains, z. B. `app.yogaswap.de`.
   * Nur wenn gesetzt: `{tenant}.{parent}` → tenantId.
   * Apex (`parent` selbst) und Hosts ohne dieses Suffix → Fallback.
   */
  multiTenantParentHost?: string;
};

/**
 * Leitet die Tenant-ID aus einem Hostname ab (#249).
 *
 * Beispiele (parent = `app.yogaswap.de`):
 * - `beharmony.app.yogaswap.de` → `beharmony`
 * - `app.yogaswap.de` → Fallback (`default-tenant`)
 * - `localhost` / `demo.yogaswap.de` → Fallback
 */
export function resolveTenantIdFromHostname(
  hostname: string,
  options: ResolveTenantIdFromHostnameOptions = {},
): string {
  const fallback =
    options.fallbackTenantId?.trim() || DEFAULT_TENANT_ID;
  const parent = normalizeHost(options.multiTenantParentHost);
  const host = normalizeHost(hostname);

  if (!host || isLocalHost(host)) {
    return fallback;
  }

  if (!parent) {
    return fallback;
  }

  if (host === parent) {
    return fallback;
  }

  const suffix = `.${parent}`;
  if (!host.endsWith(suffix)) {
    return fallback;
  }

  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".") || label === "www") {
    return fallback;
  }

  return label;
}

export type ResolveTenantAppBaseUrlOptions = {
  /** Apex-URL inkl. Schema, z. B. `https://app.yogaswap.de` (Fallback / default-tenant). */
  apexBaseUrl: string;
  /**
   * Parent-Host ohne Schema, z. B. `app.yogaswap.de`.
   * Wenn gesetzt: Studio-URLs = `https://{tenantId}.{parent}`.
   */
  multiTenantParentHost?: string;
  /** Tenant-ID die die Apex-URL nutzt (Default: default-tenant). */
  defaultTenantId?: string;
};

/**
 * Baut die App-Basis-URL für einen Tenant (Mail-Links, Invite, Login).
 * Ohne `multiTenantParentHost` bleibt es bei `apexBaseUrl`.
 */
export function resolveTenantAppBaseUrl(
  tenantId: string,
  options: ResolveTenantAppBaseUrlOptions,
): string {
  const apex = normalizeBaseUrl(options.apexBaseUrl);
  const defaultId = options.defaultTenantId?.trim() || DEFAULT_TENANT_ID;
  const parent = normalizeHost(options.multiTenantParentHost);
  const tid = tenantId.trim() || defaultId;

  if (!parent || tid === defaultId) {
    return apex;
  }

  return `https://${tid}.${parent}`;
}

function normalizeHost(value?: string): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("http") ? trimmed.replace(/\/$/, "") : `https://${trimmed.replace(/\/$/, "")}`;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}
