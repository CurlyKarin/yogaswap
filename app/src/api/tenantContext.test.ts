import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  getTenantContext,
  TenantNotFoundError,
  type TenantContextResponse,
} from "./tenantContext";

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
      isAxiosError: actual.isAxiosError,
      defaults: { headers: { common: {} } },
    },
  };
});

const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  defaults: { headers: { common: Record<string, string> } };
};

describe("getTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.defaults.headers.common = {};
  });

  it("ruft GET /tenant-context ohne user-Param auf, wenn kein user übergeben wird", async () => {
    const mockResponse: TenantContextResponse = {
      tenantId: "default-tenant",
      userId: "alice",
      tenant: {
        tenantId: "default-tenant",
        name: "Default Tenant",
        settings: {
          instructorCanSeeAllCourses: true,
        },
      },
      membership: {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
      },
    };

    mockedAxios.get = vi.fn().mockResolvedValue({ data: mockResponse });

    const result = await getTenantContext();

    expect(mockedAxios.get).toHaveBeenCalledWith("/tenant-context", {
      params: undefined,
    });
    expect(result).toEqual(mockResponse);
  });

  it("ruft GET /tenant-context mit user-Param auf, wenn user übergeben wird", async () => {
    const mockResponse: TenantContextResponse = {
      tenantId: "custom-tenant",
      userId: "bob",
      tenant: {
        tenantId: "custom-tenant",
        name: "Custom",
      },
      membership: null,
    };

    mockedAxios.get = vi.fn().mockResolvedValue({ data: mockResponse });

    const result = await getTenantContext("bob");

    expect(mockedAxios.get).toHaveBeenCalledWith("/tenant-context", {
      params: { user: "bob" },
    });
    expect(result).toEqual(mockResponse);
  });

  it("wirft TenantNotFoundError bei HTTP 400 tenant_not_found (#261)", async () => {
    mockedAxios.get = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: "tenant_not_found", tenantId: "yogastudio-test", message: "Studio nicht gefunden" },
      },
    });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    await expect(getTenantContext()).rejects.toBeInstanceOf(TenantNotFoundError);
    await expect(getTenantContext()).rejects.toMatchObject({
      tenantId: "yogastudio-test",
      message: "Studio nicht gefunden",
    });
  });

  it("wirft Fehler weiter, wenn der Request fehlschlägt", async () => {
    const error = new Error("Network error");
    mockedAxios.get = vi.fn().mockRejectedValue(error);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    await expect(getTenantContext("alice")).rejects.toThrow("Network error");
    expect(mockedAxios.get).toHaveBeenCalledWith("/tenant-context", {
      params: { user: "alice" },
    });
  });
});
