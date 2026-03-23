import type {
  Course,
  TenantSettings,
  UserTenantMembership,
} from "./types";

/**
 * Hinweis:
 * Diese Datei ist die fachliche Source-of-Truth fuer Permissions.
 * Aktuell existiert zusaetzlich eine technische Kopie in
 * `backend/src/lambdas/shared/permissions.ts`, damit Backend-Tests/Lambda-Bundles
 * ohne ESM/Jest-Interop-Probleme laufen.
 * Bei Aenderungen bitte beide Stellen synchron halten, bis die Build-Toolchain
 * vereinheitlicht ist.
 */

/**
 * Darf diese Membership Teilnehmer:innen einladen?
 * - Admin: immer ja
 * - Instructor: nur, wenn TenantSettings.instructorCanInviteParticipants === true
 * - Participant: nie
 */
export function canInviteParticipants(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
): boolean {
  if (membership.role === "admin") return true;
  if (membership.role === "instructor") {
    return !!settings?.instructorCanInviteParticipants;
  }
  return false;
}

/**
 * Darf diese Membership Teilnehmerprofile verwalten (Liste/Update)?
 * - Admin: immer ja
 * - Instructor: abhängig von TenantSettings.instructorCanManageParticipants
 *   - undefined => true (Default)
 * - Participant: nie
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

/**
 * Darf diese Membership alle Kurse des Tenants sehen?
 * - Admin: immer ja
 * - Instructor:
 *   - true, wenn Override gesetzt
 *   - sonst TenantSettings.instructorCanSeeAllCourses
 * - Participant: nie (immer nur "eigene" / gefilterte Kurse)
 */
export function canSeeAllCourses(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
): boolean {
  if (membership.role === "admin") return true;
  if (membership.role === "instructor") {
    if (membership.instructorCanSeeAllCoursesOverride != null) {
      return membership.instructorCanSeeAllCoursesOverride;
    }
    return !!settings?.instructorCanSeeAllCourses;
  }
  return false;
}

/**
 * Sichtbarkeitscheck auf Kurs-Ebene.
 * Der Aufrufer entscheidet, ob er bereits alle Kurse gefiltert hat
 * (z. B. durch canSeeAllCourses) oder hier pro Kurs filtern möchte.
 *
 * Für einen echten Teilnehmer-Fall müsste hier zusätzlich
 * Kontext über "eigene Instructor:innen" / Buchungen übergeben werden.
 * Das ist bewusst noch nicht ausmodelliert und kann später erweitert werden.
 */
export function canSeeCourse(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
  course: Course,
  context: {
    isTaughtByUser?: boolean;
    isBookedByUser?: boolean;
  },
): boolean {
  if (membership.role === "admin") return true;

  if (membership.role === "instructor") {
    if (canSeeAllCourses(membership, settings)) return true;
    return !!context.isTaughtByUser;
  }

  // Participant
  if (settings?.participantsSeeOnlyOwnInstructors) {
    return !!context.isBookedByUser || !!context.isTaughtByUser;
  }

  // Default: Teilnehmer:in sieht alle freigeschalteten Kurse
  return true;
}

