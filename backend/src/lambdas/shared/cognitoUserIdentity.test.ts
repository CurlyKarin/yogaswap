import {
  escapeCognitoListFilterValue,
  effectiveCognitoUsername,
  generateOpaqueCognitoUsername,
} from "./cognitoUserIdentity";

describe("cognitoUserIdentity", () => {
  it("generates opaque UUID usernames", () => {
    const a = generateOpaqueCognitoUsername();
    const b = generateOpaqueCognitoUsername();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(a).not.toBe(b);
  });

  it("escapes Cognito list filter quotes", () => {
    expect(escapeCognitoListFilterValue('a"b')).toBe('a\\"b');
  });

  it("falls back cognitoUsername to userId", () => {
    expect(effectiveCognitoUsername(undefined, "Luna")).toBe("Luna");
    expect(effectiveCognitoUsername("  ", "Luna")).toBe("Luna");
    expect(effectiveCognitoUsername("opaque-id", "Luna")).toBe("opaque-id");
  });
});
