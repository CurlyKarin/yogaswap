import { describe, it, expect } from "vitest";
import { canInviteParticipants, canSeeAllCourses, canSeeCourse } from "shared/permissions";

describe("permissions", () => {
  const adminMembership = { role: "admin" } as any;
  const instructorMembership = { role: "instructor" } as any;
  const instructorWithOverrideTrue = {
    role: "instructor",
    instructorCanSeeAllCoursesOverride: true,
  } as any;
  const instructorWithOverrideFalse = {
    role: "instructor",
    instructorCanSeeAllCoursesOverride: false,
  } as any;
  const participantMembership = { role: "participant" } as any;

  const defaultSettings = {
    instructorCanInviteParticipants: true,
    instructorCanSeeAllCourses: true,
    participantsSeeOnlyOwnInstructors: false,
  } as any;

  const restrictiveSettings = {
    instructorCanInviteParticipants: false,
    instructorCanSeeAllCourses: false,
    participantsSeeOnlyOwnInstructors: true,
  } as any;

  const dummyCourse = {} as any;

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

