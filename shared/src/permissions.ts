import {
  isWithinPostCourseEndGrace,
  participantCourseAccessDeadlineIso,
  toIsoDateUtc,
  wouldAutoDeactivateOnReconcile,
} from "./courseStatus";
import type {
  Course,
  ParticipantStatus,
  TenantSettings,
  UserTenantMembership,
} from "./types";

/**
 * Hinweis:
 * Diese Datei ist die fachliche Source-of-Truth fuer Permissions.
 * In `backend/src/lambdas/shared/permissions.ts` liegt eine technische Teilkopie
 * (nur Lambda-relevante Hilfen); `canSeeCourse` und weitere UI-Funktionen dort
 * ergaenzen, sobald das Backend sie braucht. Build: `shared` vor App-Tests bauen
 * (`npm run build --prefix shared`), da Vite `shared` auf `shared/dist` alias.
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

function participantBaseVisible(
  settings: TenantSettings | undefined,
  context: { isTaughtByUser?: boolean; isBookedByUser?: boolean },
): boolean {
  if (settings?.participantsSeeOnlyOwnInstructors) {
    return !!context.isBookedByUser || !!context.isTaughtByUser;
  }
  return true;
}

/**
 * Sichtbarkeitscheck auf Kurs-Ebene.
 * Der Aufrufer entscheidet, ob er bereits alle Kurse gefiltert hat
 * (z. B. durch canSeeAllCourses) oder hier pro Kurs filtern möchte.
 *
 * Teilnehmer:innen:
 * - `draft`: nie sichtbar
 * - `inactive`: nur im Nachlauf (Zugriffsfrist = `participantCourseAccessDeadlineIso`,
 *   Default-Nachlauf 7 Tage nach letztem Termin bzw. Blockende) und nur wenn die
 *   bestehende Buchungs-/Instructor-Logik zutrifft
 * - `active` / ohne Status: wie bisher
 *
 * Instructor:innen / Admins: Status filtert die Sichtbarkeit nicht (Planung / Verwaltung).
 *
 * `context.now` optional (Default: `new Date()`); fuer Tests oder deterministische UI
 * explizit setzen. Nachlauf vergleicht Kalendertage in UTC (ISO-Datum).
 */
export function canSeeCourse(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
  course: Course,
  context: {
    isTaughtByUser?: boolean;
    isBookedByUser?: boolean;
    /** Referenzzeit fuer inaktiven Nachlauf; Default `new Date()`. */
    now?: Date;
  },
): boolean {
  const refNow = context.now ?? new Date();
  const todayIso = toIsoDateUtc(refNow);
  const status = course.status ?? "active";

  if (membership.role === "admin") return true;

  if (membership.role === "instructor") {
    if (canSeeAllCourses(membership, settings)) return true;
    return !!context.isTaughtByUser;
  }

  // Participant
  if (status === "draft") return false;

  if (status === "inactive") {
    const deadline = participantCourseAccessDeadlineIso(course, settings);
    if (!deadline || todayIso > deadline) return false;
  }

  return participantBaseVisible(settings, context);
}

/**
 * Teilnehmer-Kursliste (Kacheln): Kurs anzeigen, wenn {@link canSeeCourse} zutrifft und
 * entweder sichtbare Termine existieren (`hasVisibleCourseDates`, z. B. aus
 * `getCourseDates`) oder der Kurs `inactive` ist (Nachlauf ohne aktuelle Termine).
 *
 * Admin/Instructor-Listen nutzen `visibleCourses` direkt, nicht diese Funktion.
 */
export function canShowParticipantCourseCard(
  membership: UserTenantMembership,
  settings: TenantSettings | undefined,
  course: Course,
  context: {
    isTaughtByUser?: boolean;
    isBookedByUser?: boolean;
    now?: Date;
    hasVisibleCourseDates: boolean;
  },
): boolean {
  if (!canSeeCourse(membership, settings, course, context)) return false;
  if (context.hasVisibleCourseDates) return true;
  const status = course.status ?? "active";
  if (status === "inactive") return true;
  const now = context.now ?? new Date();
  if (
    wouldAutoDeactivateOnReconcile(course, context.hasVisibleCourseDates) &&
    isWithinPostCourseEndGrace(course, settings, now)
  ) {
    return true;
  }
  return false;
}

