import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { getTenantContext, type TenantContextResponse } from "./tenantContext";

vi.mock("axios");

const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
};

describe("getTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ruft GET /tenant-context ohne user-Param auf, wenn kein user übergeben wird", async () => {
    const mockResponse: TenantContextResponse = {
      tenantId: "default-tenant",
      userId: "alice",
      tenant: {
        id: "default-tenant",
        name: "Default Tenant",
        settings: {
          visibility: "public",
        },
      } as any,
      membership: {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
      } as any,
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
      tenant: null,
      membership: null,
    };

    mockedAxios.get = vi.fn().mockResolvedValue({ data: mockResponse });

    const result = await getTenantContext("bob");

    expect(mockedAxios.get).toHaveBeenCalledWith("/tenant-context", {
      params: { user: "bob" },
    });
    expect(result).toEqual(mockResponse);
  });

  it("wirft Fehler weiter, wenn der Request fehlschlägt", async () => {
    const error = new Error("Network error");
    mockedAxios.get = vi.fn().mockRejectedValue(error);

    await expect(getTenantContext("alice")).rejects.toThrow("Network error");
    expect(mockedAxios.get).toHaveBeenCalledWith("/tenant-context", {
      params: { user: "alice" },
    });
  });
});

