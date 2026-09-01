import { describe, expect, it } from "vitest";
import {
  includesParticipantRef,
  matchesParticipantRef,
  matchesSwapParticipant,
  resolveActorParticipantRef,
} from "shared/participantActor";

const actor = { nickname: "Max", participantId: "11111111-1111-4111-8111-111111111111" };

describe("participantActor", () => {
  it("prefers participantId as canonical ref", () => {
    expect(resolveActorParticipantRef(actor)).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("matches nickname and participantId refs", () => {
    expect(matchesParticipantRef("max", actor)).toBe(true);
    expect(matchesParticipantRef(actor.participantId!, actor)).toBe(true);
    expect(matchesParticipantRef("other", actor)).toBe(false);
  });

  it("includes actor in participant lists", () => {
    expect(includesParticipantRef(["alice", actor.participantId!], actor)).toBe(true);
    expect(includesParticipantRef(["alice"], actor)).toBe(false);
  });

  it("matches swaps by participantId or legacy nickname", () => {
    expect(matchesSwapParticipant({ participantId: actor.participantId }, actor)).toBe(true);
    expect(matchesSwapParticipant({ participantId: "Max" }, actor)).toBe(true);
    expect(matchesSwapParticipant({ participantId: "other" }, actor)).toBe(false);
  });
});
