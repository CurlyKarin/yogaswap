import {
  DEFAULT_AUTH_INVITE_TOKEN_TTL_SECONDS,
  DEFAULT_AUTH_TOKEN_TTL_SECONDS,
  resolveAuthTokenTtlSeconds,
} from "./authTokenTtl";

describe("resolveAuthTokenTtlSeconds", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.AUTH_TOKEN_TTL_SECONDS;
    delete process.env.AUTH_INVITE_TOKEN_TTL_SECONDS;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("invite-activation defaults to 7 days", () => {
    expect(resolveAuthTokenTtlSeconds("invite-activation")).toBe(
      DEFAULT_AUTH_INVITE_TOKEN_TTL_SECONDS,
    );
    expect(DEFAULT_AUTH_INVITE_TOKEN_TTL_SECONDS).toBe(604800);
  });

  test("password-reset purposes default to 1 hour", () => {
    expect(resolveAuthTokenTtlSeconds("admin-password-reset")).toBe(
      DEFAULT_AUTH_TOKEN_TTL_SECONDS,
    );
    expect(resolveAuthTokenTtlSeconds("user-password-reset")).toBe(
      DEFAULT_AUTH_TOKEN_TTL_SECONDS,
    );
  });

  test("respects env overrides", () => {
    process.env.AUTH_INVITE_TOKEN_TTL_SECONDS = "86400";
    process.env.AUTH_TOKEN_TTL_SECONDS = "1800";
    expect(resolveAuthTokenTtlSeconds("invite-activation")).toBe(86400);
    expect(resolveAuthTokenTtlSeconds("admin-password-reset")).toBe(1800);
  });
});
