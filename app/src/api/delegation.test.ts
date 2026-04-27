import { beforeEach, describe, expect, it } from "vitest";
import {
  delegationHeaders,
  getActingForUserId,
  setActingForUserId,
} from "./delegation";

describe("delegation api context", () => {
  beforeEach(() => {
    setActingForUserId(null);
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

  it("normalizes empty value to null", () => {
    setActingForUserId("   ");
    expect(getActingForUserId()).toBeNull();
    expect(delegationHeaders()).toBeUndefined();
  });
});
