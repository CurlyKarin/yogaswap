import { resolveAppBaseUrlForTenant } from "./appBaseUrl";

describe("resolveAppBaseUrlForTenant", () => {
  const originalBase = process.env.BASE_URL;
  const originalHost = process.env.TENANT_BASE_HOST;

  afterEach(() => {
    if (originalBase === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = originalBase;
    if (originalHost === undefined) delete process.env.TENANT_BASE_HOST;
    else process.env.TENANT_BASE_HOST = originalHost;
  });

  it("uses BASE_URL when TENANT_BASE_HOST is unset", () => {
    process.env.BASE_URL = "https://demo.yogaswap.de";
    delete process.env.TENANT_BASE_HOST;
    expect(resolveAppBaseUrlForTenant("beharmony")).toBe("https://demo.yogaswap.de");
  });

  it("builds studio URL when TENANT_BASE_HOST is set", () => {
    process.env.BASE_URL = "https://app.yogaswap.de";
    process.env.TENANT_BASE_HOST = "app.yogaswap.de";
    expect(resolveAppBaseUrlForTenant("yogastudio-test")).toBe(
      "https://yogastudio-test.app.yogaswap.de",
    );
    expect(resolveAppBaseUrlForTenant("default-tenant")).toBe("https://app.yogaswap.de");
  });
});
