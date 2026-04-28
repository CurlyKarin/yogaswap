import type {
  Course,
  ParticipantStatus,
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
 * Darf ein Actor den Vertretungsmodus fuer einen Kurs starten?
 *
 * Regeln (MVP-kompatibel):
 * - Admin: immer ja
 * - Instructor:
 *   - braucht grundsaetzlich Teilnehmerverwaltungsrecht
 *   - wenn der Kurs Instructor-Zuordnungen hat: nur, wenn selbst zugeordnet
 *   - wenn der Kurs keine Instructor-Zuordnungen hat: durch Setting steuerbar
 *     (Default `true`, um aktuelles Verhalten nicht zu brechen)
 * - Participant: nie
 */
export function canStartDelegationForCourse(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
  context: {
    course: Pick<Course, "instructors">;
    isActorAssignedInstructor: boolean;
  },
): boolean {
  if (membership.role === "admin") return true;
  if (membership.role !== "instructor") return false;
  if (!canManageParticipants(membership, settings)) return false;

  const hasExplicitCourseInstructors = (context.course.instructors?.length ?? 0) > 0;
  if (hasExplicitCourseInstructors) {
    return context.isActorAssignedInstructor;
  }

  return settings?.instructorCanManageDelegationWithoutCourseAssignment ?? true;
}

/**
 * Darf ein Teilnehmerstatus im Vertretungsmodus verwaltet werden?
 *
 * Aktuelles Zielbild:
 * - no_login / invited: immer erlaubt
 * - active (registriert): per Setting steuerbar, Default aktuell `true`
 */
export function canManageParticipantStatusInDelegation(
  participantStatus: ParticipantStatus,
  settings: TenantSettings | undefined,
): boolean {
  if (participantStatus === "no_login" || participantStatus === "invited") {
    return true;
  }

  return settings?.delegationCanManageActiveParticipants ?? true;
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

