import { Course, CourseDateOverride, CourseEnrollment, UserTenantMembership } from "shared/types";
import { resolveEffectiveTermOccupancy } from "shared/courseEnrollment";
import type { ParticipantActor } from "shared/participantActor";
import type { ParticipantWithStatus } from "../api/participants";

export const getEffectiveParticipants = (
  course: Course,
  overrides: CourseDateOverride[],
  dateIso: string,
  enrollments: CourseEnrollment[] = [],
) => {
  const override = overrides.find((o) => o.courseId === course.id && o.date === dateIso);
  return resolveEffectiveTermOccupancy(course, override, enrollments, dateIso).participants;
};

export type ParticipantStatusPresentation = {
  color: string;
  label: string;
};

export function resolveParticipantRef(
  profile: Pick<ParticipantWithStatus, "userId" | "participantId">,
): string {
  return profile.participantId?.trim() || profile.userId;
}

export function participantDisplayName(
  profile: Pick<ParticipantWithStatus, "userId">,
): string {
  return profile.userId;
}

export function resolveActorFromMembership(
  nickname: string,
  membership?: UserTenantMembership | null,
  roster?: Array<Pick<ParticipantWithStatus, "userId" | "participantId">>,
): ParticipantActor {
  const normalizedNickname = nickname.trim();
  let participantId =
    membership?.userId?.toLowerCase() === normalizedNickname.toLowerCase()
      ? membership.participantId
      : undefined;
  if (!participantId?.trim() && roster) {
    participantId = roster.find(
      (entry) => entry.userId.toLowerCase() === normalizedNickname.toLowerCase(),
    )?.participantId;
  }
  return { nickname: normalizedNickname, participantId: participantId?.trim() || undefined };
}

export function buildParticipantNameByRefMap(
  roster: Array<Pick<ParticipantWithStatus, "userId" | "participantId">>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of roster) {
    const name = entry.userId;
    map.set(name.toLowerCase(), name);
    const participantId = entry.participantId?.trim();
    if (participantId) map.set(participantId.toLowerCase(), name);
  }
  return map;
}

export function displayNameForParticipantRef(
  ref: string,
  nameByRef?: Map<string, string>,
): string {
  return nameByRef?.get(ref.toLowerCase()) ?? ref;
}

export function getStatusPresentation(
  status: ParticipantWithStatus["status"] | undefined,
): ParticipantStatusPresentation {
  if (status === "active") {
    return { color: "#16a34a", label: "registriert" };
  }
  if (status === "invited") {
    return { color: "#facc15", label: "eingeladen" };
  }
  return { color: "#fb923c", label: "ohne Login" };
}

export function filterParticipantsBySearch<
  T extends { userId: string; participantId?: string; email?: string },
>(participants: T[], search: string): T[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return participants;
  return participants.filter((entry) => {
    const byNickname = entry.userId.toLowerCase().includes(needle);
    const byParticipantId = (entry.participantId ?? "").toLowerCase().includes(needle);
    const byEmail = (entry.email ?? "").toLowerCase().includes(needle);
    return byNickname || byParticipantId || byEmail;
  });
}