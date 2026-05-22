import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { findHorizonShrinkBlockers } from "./horizonShrinkGuard";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    QueryCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const client = { send: mockSend } as unknown as import("@aws-sdk/client-dynamodb").DynamoDBClient;

describe("horizonShrinkGuard", () => {
  beforeEach(() => {
    mockSend.mockReset();
    (QueryCommand as unknown as jest.Mock).mockClear();
  });

  test("returns null when no rolling courses", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await findHorizonShrinkBlockers(client, {
      tenantId: "t1",
      coursesTable: "courses",
      swapsTable: "swaps",
      overridesTable: "overrides",
      currentWeeks: 8,
      nextWeeks: 5,
      now: new Date("2026-05-19T12:00:00.000Z"),
    });
    expect(result).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("loads courses, swaps, and overrides when shrinking", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [{ courseId: { S: "1" }, planningMode: { S: "rolling_continuous" } }],
      })
      .mockResolvedValueOnce({
        Items: [
          {
            fromCourseId: { S: "1" },
            toCourseId: { S: "2" },
            fromDate: { S: "2026-06-24" },
            toDate: { S: "2026-08-01" },
            status: { S: "pending" },
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    const result = await findHorizonShrinkBlockers(client, {
      tenantId: "t1",
      coursesTable: "courses",
      swapsTable: "swaps",
      overridesTable: "overrides",
      currentWeeks: 8,
      nextWeeks: 5,
      now: new Date("2026-05-19T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ swapCount: 1, overrideCount: 0 });
    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});
