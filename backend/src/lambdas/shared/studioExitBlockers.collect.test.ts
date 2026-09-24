import { collectStudioExitBlockers } from "./studioExitBlockers";
import { queryCourseEnrollments } from "./courseEnrollmentDynamo";
import { querySwapsForUserRefs } from "./swapQueryHelpers";

jest.mock("./courseEnrollmentDynamo", () => ({
  queryCourseEnrollments: jest.fn(),
}));

jest.mock("./swapQueryHelpers", () => ({
  querySwapsForUserRefs: jest.fn(),
}));

const mockedQueryEnrollments = queryCourseEnrollments as jest.MockedFunction<
  typeof queryCourseEnrollments
>;
const mockedQuerySwaps = querySwapsForUserRefs as jest.MockedFunction<
  typeof querySwapsForUserRefs
>;

describe("collectStudioExitBlockers", () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    mockSend.mockReset();
    mockedQueryEnrollments.mockReset();
    mockedQuerySwaps.mockReset();
    mockedQuerySwaps.mockResolvedValue([]);
  });

  it("does not block on stale course.participants when enrollment is already past (#271)", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          {
            courseId: { N: "1" },
            name: { S: "Yoga Flow" },
            participants: { L: [{ S: "bjorn" }] },
          },
        ],
      }) // courses
      .mockResolvedValueOnce({ Items: [] }); // overrides / waitlist

    mockedQueryEnrollments.mockResolvedValueOnce([
      {
        tenantId: "t1",
        courseId: 1,
        participantId: "bjorn",
        validFrom: "2026-01-01",
        validUntil: "2026-09-01",
      },
    ]);

    const blockers = await collectStudioExitBlockers({
      client: { send: mockSend } as never,
      tenantId: "t1",
      userId: "bjorn",
      coursesTable: "courses",
      enrollmentsTable: "enrollments",
      swapsTable: "swaps",
      overridesTable: "overrides",
      now: new Date("2026-09-24T12:00:00Z"),
    });

    expect(blockers.courses).toEqual([]);
    expect(blockers.swaps).toEqual([]);
    expect(blockers.waitlist).toEqual([]);
    expect(hasNoBlockers(blockers)).toBe(true);
  });

  it("still blocks when enrollment is open or validUntil in the future", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          {
            courseId: { N: "2" },
            name: { S: "Abend" },
            status: { S: "active" },
            participants: { L: [{ S: "bjorn" }] },
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    mockedQueryEnrollments.mockResolvedValueOnce([
      {
        tenantId: "t1",
        courseId: 2,
        participantId: "bjorn",
        validFrom: "2026-01-01",
        validUntil: "2026-10-01",
      },
    ]);

    const blockers = await collectStudioExitBlockers({
      client: { send: mockSend } as never,
      tenantId: "t1",
      userId: "bjorn",
      coursesTable: "courses",
      enrollmentsTable: "enrollments",
      swapsTable: "swaps",
      overridesTable: "overrides",
      now: new Date("2026-09-24T12:00:00Z"),
    });

    expect(blockers.courses).toEqual([
      { courseId: 2, courseName: "Abend", reason: "enrollment" },
    ]);
  });

  it("does not block for inactive courses even with open enrollment", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          {
            courseId: { N: "3" },
            name: { S: "Alter Block" },
            status: { S: "inactive" },
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    mockedQueryEnrollments.mockResolvedValueOnce([
      {
        tenantId: "t1",
        courseId: 3,
        participantId: "bjorn",
        validFrom: "2026-01-01",
      },
    ]);

    const blockers = await collectStudioExitBlockers({
      client: { send: mockSend } as never,
      tenantId: "t1",
      userId: "bjorn",
      coursesTable: "courses",
      enrollmentsTable: "enrollments",
      swapsTable: "swaps",
      overridesTable: "overrides",
      now: new Date("2026-09-24T12:00:00Z"),
    });

    expect(blockers.courses).toEqual([]);
  });

  it("blocks for draft/planning courses with open enrollment", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          {
            courseId: { N: "4" },
            name: { S: "Neuer Block" },
            status: { S: "draft" },
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    mockedQueryEnrollments.mockResolvedValueOnce([
      {
        tenantId: "t1",
        courseId: 4,
        participantId: "bjorn",
        validFrom: "2026-10-01",
      },
    ]);

    const blockers = await collectStudioExitBlockers({
      client: { send: mockSend } as never,
      tenantId: "t1",
      userId: "bjorn",
      coursesTable: "courses",
      enrollmentsTable: "enrollments",
      swapsTable: "swaps",
      overridesTable: "overrides",
      now: new Date("2026-09-24T12:00:00Z"),
    });

    expect(blockers.courses).toEqual([
      { courseId: 4, courseName: "Neuer Block", reason: "enrollment" },
    ]);
  });
});

function hasNoBlockers(blockers: {
  courses: unknown[];
  swaps: unknown[];
  waitlist: unknown[];
}): boolean {
  return (
    blockers.courses.length === 0 &&
    blockers.swaps.length === 0 &&
    blockers.waitlist.length === 0
  );
}
