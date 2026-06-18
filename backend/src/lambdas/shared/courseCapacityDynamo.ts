import type { CourseCapacityFields } from "@yogaswap/shared";
import { validateTermOccupancy } from "@yogaswap/shared";

type DynamoNumberField = { N?: string };

export function courseCapacityFromDynamoItem(
  item: Record<string, DynamoNumberField | undefined>,
): CourseCapacityFields {
  const capacity = item.capacity?.N ? Number.parseInt(item.capacity.N, 10) : 0;
  const overbookLimit = item.overbookLimit?.N ? Number.parseInt(item.overbookLimit.N, 10) : 0;
  return {
    capacity: Number.isFinite(capacity) && capacity >= 0 ? capacity : 0,
    overbookLimit: Number.isFinite(overbookLimit) && overbookLimit >= 0 ? overbookLimit : 0,
  };
}

export function validateParticipantsForCourse(
  participants: string[],
  course: CourseCapacityFields,
  guestCount = 0,
): string | null {
  return validateTermOccupancy(participants.length, course, guestCount);
}
