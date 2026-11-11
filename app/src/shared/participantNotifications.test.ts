import { describe, expect, it } from "vitest";
import {
  isParticipantEmailNotificationEnabled,
  resolveParticipantNotificationPrefs,
} from "shared/participantNotifications";

describe("participantNotifications (#437)", () => {
  it("defaults to enabled when prefs missing", () => {
    expect(isParticipantEmailNotificationEnabled(undefined, "studioCourse")).toBe(true);
    expect(isParticipantEmailNotificationEnabled({}, "ownTermChange")).toBe(true);
    expect(isParticipantEmailNotificationEnabled(null, "waitlistPromotion")).toBe(true);
  });

  it("respects explicit false / true", () => {
    expect(
      isParticipantEmailNotificationEnabled({ studioCourseEmail: false }, "studioCourse"),
    ).toBe(false);
    expect(
      isParticipantEmailNotificationEnabled({ ownTermChangeEmail: true }, "ownTermChange"),
    ).toBe(true);
    expect(
      isParticipantEmailNotificationEnabled(
        { waitlistPromotionEmail: false, ownTermChangeEmail: true },
        "waitlistPromotion",
      ),
    ).toBe(false);
  });

  it("resolveParticipantNotificationPrefs fills defaults", () => {
    expect(resolveParticipantNotificationPrefs(undefined)).toEqual({
      studioCourseEmail: true,
      ownTermChangeEmail: true,
      waitlistPromotionEmail: true,
    });
    expect(
      resolveParticipantNotificationPrefs({
        studioCourseEmail: false,
        waitlistPromotionEmail: false,
      }),
    ).toEqual({
      studioCourseEmail: false,
      ownTermChangeEmail: true,
      waitlistPromotionEmail: false,
    });
  });
});
