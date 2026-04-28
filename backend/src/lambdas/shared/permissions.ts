import type { Course, ParticipantStatus, TenantSettings, UserTenantMembership } from "@yogaswap/shared";

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

export function canManageParticipantStatusInDelegation(
  participantStatus: ParticipantStatus,
  settings: TenantSettings | undefined,
): boolean {
  if (participantStatus === "no_login" || participantStatus === "invited") {
    return true;
  }

  return settings?.delegationCanManageActiveParticipants ?? true;
}
