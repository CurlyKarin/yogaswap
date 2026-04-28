import { beforeEach, describe, expect, it } from "vitest";
import {
  delegationHeaders,
  getActorUserId,
  getActingForUserId,
  setActorUserId,
  setActingForUserId,
} from "./delegation";

describe("delegation api context", () => {
  beforeEach(() => {
    setActingForUserId(null);
    setActorUserId(null);
  });

  it("is empty by default", () => {
    expect(getActingForUserId()).toBeNull();
    expect(delegationHeaders()).toBeUndefined();
  });

  it("stores actingFor user and exposes header", () => {
    setActingForUserId("maya");
    expect(getActingForUserId()).toBe("maya");
    expect(delegationHeaders()).toEqual({
      "x-acting-for-user-id": "maya",
    });
  });

  it("stores actor user and exposes actor header", () => {
    setActorUserId("admin");
    expect(getActorUserId()).toBe("admin");
    expect(delegationHeaders()).toEqual({
      "x-actor-user-id": "admin",
    });
  });

  it("combines actor and actingFor headers", () => {
    setActorUserId("admin");
    setActingForUserId("maya");
    expect(delegationHeaders()).toEqual({
      "x-actor-user-id": "admin",
      "x-acting-for-user-id": "maya",
    });
  });

  it("normalizes empty value to null", () => {
    setActingForUserId("   ");
    expect(getActingForUserId()).toBeNull();
    expect(delegationHeaders()).toBeUndefined();
  });
});
