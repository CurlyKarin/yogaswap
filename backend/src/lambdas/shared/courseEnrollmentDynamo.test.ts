import { enrollmentToDynamoItem, dynamoItemToEnrollment } from "./courseEnrollmentDynamo";

describe("courseEnrollmentDynamo", () => {
  it("round-trips enrollment items", () => {
    const item = enrollmentToDynamoItem(
      {
        tenantId: "default-tenant",
        courseId: 3,
        participantId: "luna",
        validFrom: "2026-03-10",
        validUntil: "2026-06-01",
        source: "migration",
        createdAt: "2026-08-11T10:00:00.000Z",
      },
      "default-tenant",
    );
    expect(item.courseId_userId_validFrom).toEqual({ S: "3#luna#2026-03-10" });
    expect(item.participantId).toEqual({ S: "luna" });
    expect(dynamoItemToEnrollment(item)).toEqual({
      tenantId: "default-tenant",
      courseId: 3,
      participantId: "luna",
      validFrom: "2026-03-10",
      validUntil: "2026-06-01",
      source: "migration",
      createdAt: "2026-08-11T10:00:00.000Z",
    });
  });

  it("reads legacy userId attribute as participantId", () => {
    const legacy = {
      tenantId: { S: "default-tenant" },
      courseId_userId_validFrom: { S: "1#maya#2026-01-01" },
      courseIdNumeric: { N: "1" },
      userId: { S: "maya" },
      validFrom: { S: "2026-01-01" },
    };
    expect(dynamoItemToEnrollment(legacy)?.participantId).toBe("maya");
  });
});
