import { describe, it, expect } from "vitest";
import {
  canInviteParticipants,
  canManageParticipants,
  canSeeAllCourses,
  canSeeCourse,
} from "shared/permissions";
import type {
  UserTenantMembership,
  TenantSettings,
  Course,
} from "shared/types";

describe("permissions", () => {
  const adminMembership: UserTenantMembership = {
    userId: "admin-user",
    tenantId: "tenant-1",
    role: "admin",
  };

  const instructorMembership: UserTenantMembership = {
    userId: "instructor-user",
    tenantId: "tenant-1",
    role: "instructor",
  };

  const instructorWithOverrideTrue: UserTenantMembership = {
    userId: "instructor-override-true",
    tenantId: "tenant-1",
    role: "instructor",
    instructorCanSeeAllCoursesOverride: true,
  };

  const instructorWithOverrideFalse: UserTenantMembership = {
    userId: "instructor-override-false",
    tenantId: "tenant-1",
    role: "instructor",
    instructorCanSeeAllCoursesOverride: false,
  };

  const participantMembership: UserTenantMembership = {
    userId: "participant-user",
    tenantId: "tenant-1",
    role: "participant",
  };

  const defaultSettings: TenantSettings = {
    instructorCanInviteParticipants: true,
    instructorCanSeeAllCourses: true,
    participantsSeeOnlyOwnInstructors: false,
  };

  const restrictiveSettings: TenantSettings = {
    instructorCanInviteParticipants: false,
    instructorCanSeeAllCourses: false,
    participantsSeeOnlyOwnInstructors: true,
  };

  const dummyCourse: Course = {
    tenantId: "tenant-1",
    id: 1,
    name: "Dummy",
    weekday: "Mon",
    time: "10:00",
    capacity: 10,
    participants: [],
    dates: [],
  };

  describe("canInviteParticipants", () => {
    it("erlaubt Admins immer, Teilnehmer:innen einzuladen", () => {
      expect(canInviteParticipants(adminMembership, undefined)).toBe(true);
      expect(canInviteParticipants(adminMembership, restrictiveSettings)).toBe(true);
    });

    it("erlaubt Instructor nur Einladungen, wenn das Setting aktiv ist", () => {
      expect(canInviteParticipants(instructorMembership, defaultSettings)).toBe(true);
      expect(canInviteParticipants(instructorMembership, restrictiveSettings)).toBe(false);
      expect(canInviteParticipants(instructorMembership, undefined)).toBe(false);
    });

    it("erlaubt Participant nie Einladungen", () => {
      expect(canInviteParticipants(participantMembership, defaultSettings)).toBe(false);
      expect(canInviteParticipants(participantMembership, undefined)).toBe(false);
    });
  });

  describe("canManageParticipants", () => {
    it("erlaubt Admins immer Teilnehmerverwaltung", () => {
      expect(canManageParticipants(adminMembership, undefined)).toBe(true);
      expect(canManageParticipants(adminMembership, restrictiveSettings)).toBe(true);
    });

    it("erlaubt Instructor standardmäßig (undefined => true)", () => {
      expect(canManageParticipants(instructorMembership, undefined)).toBe(true);
    });

    it("respektiert instructorCanManageParticipants im Tenant-Setting", () => {
      expect(
        canManageParticipants(instructorMembership, {
          ...defaultSettings,
          instructorCanManageParticipants: true,
        }),
      ).toBe(true);
      expect(
        canManageParticipants(instructorMembership, {
          ...defaultSettings,
          instructorCanManageParticipants: false,
        }),
      ).toBe(false);
    });

    it("verbietet Participant die Teilnehmerverwaltung", () => {
      expect(canManageParticipants(participantMembership, defaultSettings)).toBe(false);
    });
  });

  describe("canSeeAllCourses", () => {
    it("erlaubt Admins immer alle Kurse zu sehen", () => {
      expect(canSeeAllCourses(adminMembership, undefined)).toBe(true);
      expect(canSeeAllCourses(adminMembership, restrictiveSettings)).toBe(true);
    });

    it("nutzt Instructor-Override, wenn gesetzt", () => {
      expect(canSeeAllCourses(instructorWithOverrideTrue, restrictiveSettings)).toBe(true);
      expect(canSeeAllCourses(instructorWithOverrideFalse, defaultSettings)).toBe(false);
    });

    it("fällt für Instructor ohne Override auf TenantSettings zurück", () => {
      expect(canSeeAllCourses(instructorMembership, defaultSettings)).toBe(true);
      expect(canSeeAllCourses(instructorMembership, restrictiveSettings)).toBe(false);
      expect(canSeeAllCourses(instructorMembership, undefined)).toBe(false);
    });

    it("erlaubt Participant nie alle Kurse zu sehen", () => {
      expect(canSeeAllCourses(participantMembership, defaultSettings)).toBe(false);
      expect(canSeeAllCourses(participantMembership, undefined)).toBe(false);
    });
  });

  describe("canSeeCourse", () => {
    it("erlaubt Admins immer, einen Kurs zu sehen", () => {
      expect(
        canSeeCourse(adminMembership, defaultSettings, dummyCourse, {
          isTaughtByUser: false,
          isBookedByUser: false,
        }),
      ).toBe(true);
    });

    it("erlaubt Instructor mit canSeeAllCourses alle Kurse", () => {
      expect(
        canSeeCourse(instructorWithOverrideTrue, restrictiveSettings, dummyCourse, {
          isTaughtByUser: false,
          isBookedByUser: false,
        }),
      ).toBe(true);
    });

    it("erlaubt Instructor ohne canSeeAllCourses nur Kurse, die sie selbst unterrichten", () => {
      expect(
        canSeeCourse(instructorMembership, restrictiveSettings, dummyCourse, {
          isTaughtByUser: true,
          isBookedByUser: false,
        }),
      ).toBe(true);

      expect(
        canSeeCourse(instructorMembership, restrictiveSettings, dummyCourse, {
          isTaughtByUser: false,
          isBookedByUser: true,
        }),
      ).toBe(false);
    });

    it("beschränkt Participant bei aktivem participantsSeeOnlyOwnInstructors-Flag auf eigene Buchungen/Instructor:innen", () => {
      expect(
        canSeeCourse(participantMembership, restrictiveSettings, dummyCourse, {
          isTaughtByUser: true,
          isBookedByUser: false,
        }),
      ).toBe(true);

      expect(
        canSeeCourse(participantMembership, restrictiveSettings, dummyCourse, {
          isTaughtByUser: false,
          isBookedByUser: true,
        }),
      ).toBe(true);

      expect(
        canSeeCourse(participantMembership, restrictiveSettings, dummyCourse, {
          isTaughtByUser: false,
          isBookedByUser: false,
        }),
      ).toBe(false);
    });

    it("erlaubt Participant standardmäßig alle Kurse, wenn kein Restriktions-Flag gesetzt ist", () => {
      expect(
        canSeeCourse(participantMembership, defaultSettings, dummyCourse, {
          isTaughtByUser: false,
          isBookedByUser: false,
        }),
      ).toBe(true);
    });
  });
});

