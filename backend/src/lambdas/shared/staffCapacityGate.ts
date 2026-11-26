import {
  evaluateStaffOccupancy,
  resolveStaffOverCapacityMode,
  type CourseCapacityFields,
  type StaffOccupancyEvaluation,
  type TenantSettings,
} from "@yogaswap/shared";

export type StaffCapacityGateResult =
  | { ok: true; evaluation: StaffOccupancyEvaluation }
  | {
      ok: false;
      statusCode: 400 | 409;
      body: {
        error: string;
        code: "capacity_exceeded_blocked" | "capacity_exceeded_needs_confirm";
        limit: number;
        nextOccupancy: number;
      };
    };

/**
 * Staff-Aktion gegen Raumgrenze (#427): bis maxCapacity ok;
 * darüber block oder 409 needs_confirm (bei Bestätigung ok).
 */
export function gateStaffOccupancy(params: {
  participantCount: number;
  course: CourseCapacityFields;
  guestCount: number;
  tenantSettings?: TenantSettings;
  confirmExceedMaxCapacity?: boolean;
}): StaffCapacityGateResult {
  const mode = resolveStaffOverCapacityMode(params.tenantSettings);
  const evaluation = evaluateStaffOccupancy(
    params.participantCount,
    params.course,
    params.guestCount,
    mode,
  );
  if (evaluation.status === "ok") {
    return { ok: true, evaluation };
  }
  if (evaluation.status === "blocked") {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: evaluation.message,
        code: "capacity_exceeded_blocked",
        limit: evaluation.limit,
        nextOccupancy: evaluation.nextOccupancy,
      },
    };
  }
  if (params.confirmExceedMaxCapacity) {
    return { ok: true, evaluation };
  }
  return {
    ok: false,
    statusCode: 409,
    body: {
      error: evaluation.message,
      code: "capacity_exceeded_needs_confirm",
      limit: evaluation.limit,
      nextOccupancy: evaluation.nextOccupancy,
    },
  };
}
