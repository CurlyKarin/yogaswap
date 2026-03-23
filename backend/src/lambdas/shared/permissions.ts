import type { TenantSettings, UserTenantMembership } from "@yogaswap/shared";

/**
 * Technische Kopie von `shared/src/permissions.ts`.
 * Grund: Value-Import aus `@yogaswap/shared` fuehrt im Backend-Testsetup aktuell
 * zu ESM/Jest-Interop-Problemen. Diese Datei kann entfallen, sobald die
 * Toolchain vereinheitlicht ist.
 */
export function canManageParticipants(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
): boolean {
  if (membership.role === "admin") return true;
  if (membership.role === "instructor") {
    return settings?.instructorCanManageParticipants ?? true;
  }
  return false;
}
