import { reconcilePendingSwapsPastOriginCutoff } from "./swapCutoffReconcile";

const send = jest.fn();

describe("reconcilePendingSwapsPastOriginCutoff", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("deletes pending swaps when origin is in cutoff", async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: undefined });
    const client = { send } as never;
    const now = new Date(2099, 5, 15, 9, 30);
    const swaps = [
      {
        participantId: "alice",
        fromCourseId: 1,
        fromDate: "2099-06-15",
        toCourseId: 1,
        toDate: "2099-06-20",
        status: "pending" as const,
      },
    ];
    const result = await reconcilePendingSwapsPastOriginCutoff({
      client,
      swapsTable: "swaps",
      overridesTable: "overrides",
      tenantId: "t1",
      swaps,
      courseTimes: new Map([[1, "10:00"]]),
      tenantSettings: { cancellationSwapCutoffMinutesBeforeStart: 60 },
      now,
    });
    expect(result).toEqual([]);
    expect(send).toHaveBeenCalled();
  });

  it("keeps pending swaps outside cutoff", async () => {
    const client = { send } as never;
    const now = new Date(2099, 5, 15, 7, 0);
    const swaps = [
      {
        participantId: "alice",
        fromCourseId: 1,
        fromDate: "2099-06-15",
        toCourseId: 1,
        toDate: "2099-06-20",
        status: "pending" as const,
      },
    ];
    const result = await reconcilePendingSwapsPastOriginCutoff({
      client,
      swapsTable: "swaps",
      overridesTable: "overrides",
      tenantId: "t1",
      swaps,
      courseTimes: new Map([[1, "10:00"]]),
      tenantSettings: { cancellationSwapCutoffMinutesBeforeStart: 60 },
      now,
    });
    expect(result).toEqual(swaps);
    expect(send).not.toHaveBeenCalled();
  });
});
