import { enrollmentToDynamoItem, dynamoItemToEnrollment } from "./courseEnrollmentDynamo";

describe("courseEnrollmentDynamo", () => {
  it("round-trips enrollment items", () => {
    const item = enrollmentToDynamoItem(
      {
        tenantId: "default-tenant",
        courseId: 3,
        userId: "luna",
        validFrom: "2026-03-10",
        validUntil: "2026-06-01",
        source: "migration",
        createdAt: "2026-08-11T10:00:00.000Z",
      },
      "default-tenant",
    );
    expect(item.courseId_userId_validFrom).toEqual({ S: "3#luna#2026-03-10" });
    expect(dynamoItemToEnrollment(item)).toEqual({
      tenantId: "default-tenant",
      courseId: 3,
      userId: "luna",
      validFrom: "2026-03-10",
      validUntil: "2026-06-01",
      source: "migration",
      createdAt: "2026-08-11T10:00:00.000Z",
    });
  });
});
