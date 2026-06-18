import {
  courseCapacityFromDynamoItem,
  validateParticipantsForCourse,
} from "./courseCapacityDynamo";

describe("courseCapacityDynamo", () => {
  it("courseCapacityFromDynamoItem parses capacity and overbookLimit", () => {
    expect(
      courseCapacityFromDynamoItem({
        capacity: { N: "4" },
        overbookLimit: { N: "2" },
      }),
    ).toEqual({ capacity: 4, overbookLimit: 2 });
  });

  it("validateParticipantsForCourse enforces maxCapacity", () => {
    const course = { capacity: 4, overbookLimit: 2 };
    expect(validateParticipantsForCourse(["a", "b", "c", "d", "e", "f"], course)).toBeNull();
    expect(validateParticipantsForCourse(["a", "b", "c", "d", "e", "f", "g"], course)).toMatch(
      /Maximal 6/,
    );
    expect(validateParticipantsForCourse(["a", "b", "c", "d"], course, 2)).toBeNull();
    expect(validateParticipantsForCourse(["a", "b", "c", "d", "e"], course, 2)).toMatch(
      /Maximal 6/,
    );
  });
});
