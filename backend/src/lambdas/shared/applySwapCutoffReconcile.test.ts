import type { Swap } from "@yogaswap/shared";
import { applySwapCutoffReconcileIfConfigured } from "./applySwapCutoffReconcile";
import { loadTenantSettings } from "./tenantSettingsLoader";
import { loadCourseTimesByLegacyId, reconcilePendingSwapsPastOriginCutoff } from "./swapCutoffReconcile";

jest.mock("./tenantSettingsLoader", () => ({
  loadTenantSettings: jest.fn(),
}));

jest.mock("./swapCutoffReconcile", () => ({
  loadCourseTimesByLegacyId: jest.fn(),
  reconcilePendingSwapsPastOriginCutoff: jest.fn(),
}));

const mockedLoadTenantSettings = loadTenantSettings as jest.MockedFunction<typeof loadTenantSettings>;
const mockedLoadCourseTimesByLegacyId = loadCourseTimesByLegacyId as jest.MockedFunction<
  typeof loadCourseTimesByLegacyId
>;
const mockedReconcile = reconcilePendingSwapsPastOriginCutoff as jest.MockedFunction<
  typeof reconcilePendingSwapsPastOriginCutoff
>;

describe("applySwapCutoffReconcileIfConfigured", () => {
  const oldEnv = process.env;
  const client = { send: jest.fn() } as never;
  const pendingSwap: Swap = {
    user: "alice",
    fromCourseId: 1,
    fromDate: "2099-06-15",
    toCourseId: 2,
    toDate: "2099-06-20",
    status: "pending",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...oldEnv,
      SWAPS_TABLE: "swaps",
      OVERRIDES_TABLE: "overrides",
      COURSES_TABLE: "courses",
      TENANTS_TABLE: "tenants",
    };
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it("macht no-op bei fehlender ENV-Konfiguration", async () => {
    delete process.env.TENANTS_TABLE;
    const swaps = [pendingSwap];
    const result = await applySwapCutoffReconcileIfConfigured({
      client,
      tenantId: "t1",
      swaps,
    });
    expect(result).toBe(swaps);
    expect(mockedLoadTenantSettings).not.toHaveBeenCalled();
    expect(mockedReconcile).not.toHaveBeenCalled();
  });

  it("macht no-op ohne pending swaps", async () => {
    const swaps: Swap[] = [{ ...pendingSwap, status: "active" }];
    const result = await applySwapCutoffReconcileIfConfigured({
      client,
      tenantId: "t1",
      swaps,
    });
    expect(result).toBe(swaps);
    expect(mockedLoadTenantSettings).not.toHaveBeenCalled();
    expect(mockedReconcile).not.toHaveBeenCalled();
  });

  it("lädt Settings + CourseTimes und ruft reconcile auf", async () => {
    mockedLoadTenantSettings.mockResolvedValue({ cancellationSwapCutoffMinutesBeforeStart: 60 });
    const courseTimes = new Map<number, string>([[1, "10:00"]]);
    mockedLoadCourseTimesByLegacyId.mockResolvedValue(courseTimes);
    mockedReconcile.mockResolvedValue([]);
    const swaps = [pendingSwap, { ...pendingSwap, status: "active" as const }];

    await applySwapCutoffReconcileIfConfigured({
      client,
      tenantId: "tenant-1",
      swaps,
    });

    expect(mockedLoadTenantSettings).toHaveBeenCalledWith(client, "tenants", "tenant-1");
    expect(mockedLoadCourseTimesByLegacyId).toHaveBeenCalledWith(client, "courses", "tenant-1", [1]);
    expect(mockedReconcile).toHaveBeenCalledWith({
      client,
      swapsTable: "swaps",
      overridesTable: "overrides",
      tenantId: "tenant-1",
      swaps,
      courseTimes,
      tenantSettings: { cancellationSwapCutoffMinutesBeforeStart: 60 },
    });
  });

  it("gibt das reconcile-Ergebnis durch", async () => {
    mockedLoadTenantSettings.mockResolvedValue(undefined);
    mockedLoadCourseTimesByLegacyId.mockResolvedValue(new Map());
    const reconciled: Swap[] = [{ ...pendingSwap, status: "active" }];
    mockedReconcile.mockResolvedValue(reconciled);

    const result = await applySwapCutoffReconcileIfConfigured({
      client,
      tenantId: "t1",
      swaps: [pendingSwap],
    });
    expect(result).toEqual(reconciled);
  });
});
