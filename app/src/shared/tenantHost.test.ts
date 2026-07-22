import { describe, it, expect } from "vitest";
import {
  resolveTenantIdFromHostname,
  resolveTenantAppBaseUrl,
} from "shared/tenantHost";

describe("resolveTenantIdFromHostname", () => {
  const parent = "app.yogaswap.de";

  it("maps studio subdomain to tenant id", () => {
    expect(
      resolveTenantIdFromHostname("beharmony.app.yogaswap.de", {
        multiTenantParentHost: parent,
      }),
    ).toBe("beharmony");
  });

  it("uses fallback on apex host", () => {
    expect(
      resolveTenantIdFromHostname("app.yogaswap.de", {
        multiTenantParentHost: parent,
        fallbackTenantId: "default-tenant",
      }),
    ).toBe("default-tenant");
  });

  it("uses fallback on localhost even with parent configured", () => {
    expect(
      resolveTenantIdFromHostname("localhost", {
        multiTenantParentHost: parent,
        fallbackTenantId: "default-tenant",
      }),
    ).toBe("default-tenant");
  });

  it("uses fallback when parent is unset (demo/staging)", () => {
    expect(
      resolveTenantIdFromHostname("demo.yogaswap.de", {
        fallbackTenantId: "default-tenant",
      }),
    ).toBe("default-tenant");
  });

  it("uses fallback for www and nested labels", () => {
    expect(
      resolveTenantIdFromHostname("www.app.yogaswap.de", {
        multiTenantParentHost: parent,
      }),
    ).toBe("default-tenant");
    expect(
      resolveTenantIdFromHostname("a.b.app.yogaswap.de", {
        multiTenantParentHost: parent,
      }),
    ).toBe("default-tenant");
  });

  it("ignores hosts that do not end with the parent", () => {
    expect(
      resolveTenantIdFromHostname("staging.yogaswap.de", {
        multiTenantParentHost: parent,
      }),
    ).toBe("default-tenant");
  });
});

describe("resolveTenantAppBaseUrl", () => {
  const apex = "https://app.yogaswap.de";
  const parent = "app.yogaswap.de";

  it("keeps apex for default-tenant", () => {
    expect(
      resolveTenantAppBaseUrl("default-tenant", {
        apexBaseUrl: apex,
        multiTenantParentHost: parent,
      }),
    ).toBe(apex);
  });

  it("builds studio subdomain URL", () => {
    expect(
      resolveTenantAppBaseUrl("beharmony", {
        apexBaseUrl: apex,
        multiTenantParentHost: parent,
      }),
    ).toBe("https://beharmony.app.yogaswap.de");
  });

  it("falls back to apex when parent is unset", () => {
    expect(
      resolveTenantAppBaseUrl("beharmony", {
        apexBaseUrl: apex,
      }),
    ).toBe(apex);
  });

  it("normalizes apex without scheme", () => {
    expect(
      resolveTenantAppBaseUrl("default-tenant", {
        apexBaseUrl: "app.yogaswap.de",
      }),
    ).toBe("https://app.yogaswap.de");
  });
});
