import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import {
  deriveVisibleDates,
  pruneScheduleExceptions,
} from "../shared/courseDates";
import { shouldAutoDeactivateCourse, type Course } from "@yogaswap/shared";
import { overrideBlocksCourseLifecycle, hasBlockingUpcomingCourseDates } from "../shared/courseLifecycle";
import {
  courseHasParticipants,
  isPlanningModeChangeLocked,
  isPlannedEndDateAllowed,
  isRollingInactiveBlocked,
  PLANNING_MODE_LOCKED_MESSAGE,
  PLANNED_END_INVALID_MESSAGE,
  ROLLING_INACTIVE_USE_PLANNED_END_MESSAGE,
} from "../shared/courseEditPolicy";
import {
  loadTenantSettings,
  resolveRollingPlanningHorizonWeeks,
} from "../shared/tenantSettingsLoader";
import { generateCourseUid, resolveLegacyCourseIdFromPathSegment } from "../shared/courseUid";
import { notifyParticipantsPlannedEndDate } from "../shared/plannedEndDateNotifications";
import { validateOverbookLimit, validateParticipantListSize } from "@yogaswap/shared";
import {
  collectOverrideKeysForReactivationCleanup,
  isScheduleExceptionPatchBody,
  isScheduleWindowPatchBody,
  resolveReactivatedExcludedDates,
  resolveVisibleActiveDates,
} from "../shared/overrideReactivation";

const INSTRUCTOR_OVERBOOK_ONLY_KEYS = new Set(["overbookLimit"]);

function isInstructorOverbookOnlyPatch(body: UpdateCourseBody): boolean {
  const keys = Object.keys(body).filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  return keys.length > 0 && keys.every((key) => INSTRUCTOR_OVERBOOK_ONLY_KEYS.has(key));
}

const client = dynamoClient;
const COURSE_STATUSES = new Set(["inactive", "draft", "active"]);
const COURSE_PLANNING_MODES = new Set(["bounded_series", "rolling_continuous"]);
const COURSE_VISIBILITY_MODES = new Set(["fixed_window", "rolling_horizon"]);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const OVERRIDE_SYNC_TIME_BUFFER_MINUTES = 30;

type UpdateCourseBody = {
  name?: string;
  weekday?: string;
  time?: string;
  capacity?: number;
  overbookLimit?: number;
  status?: string;
  planningMode?: string;
  visibilityMode?: string;
  seriesStartDate?: string;
  seriesEndDate?: string;
  plannedEndDate?: string | null;
  visibleFrom?: string;
  visibleUntil?: string;
  excludedDates?: string[];
  includedDates?: string[];
  participants?: string[];
};

function parseBody(event: APIGatewayProxyEvent): UpdateCourseBody | null {
  if (!event.body) return null;
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as UpdateCourseBody;
  } catch {
    return null;
  }
}

function normalizeDateListInput(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (normalized.some((entry) => !ISO_DATE_ONLY.test(entry))) return null;
  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}

function normalizeParticipantListInput(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}

function isValidDateRange(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  if (!ISO_DATE_ONLY.test(start) || !ISO_DATE_ONLY.test(end)) return false;
  return start <= end;
}

function isCourseInFutureWithBuffer(courseDate: string, courseTime: string, now: Date): boolean {
  try {
    const [year, month, day] = courseDate.split("-").map(Number);
    const [hours, minutes] = courseTime.split(":").map(Number);
    const courseStart = new Date(year, month - 1, day, hours, minutes);
    const bufferTime = new Date(now.getTime() + OVERRIDE_SYNC_TIME_BUFFER_MINUTES * 60 * 1000);
    return courseStart >= bufferTime;
  } catch {
    return false;
  }
}

function toIsoDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysLocal(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getRollingPlanningLockBounds(
  now: Date,
  rollingPlanningHorizonWeeks: number,
): { startIso: string; endIso: string } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = addDaysLocal(startOfToday, rollingPlanningHorizonWeeks * 7);
  return {
    startIso: toIsoDateOnlyLocal(startOfToday),
    endIso: toIsoDateOnlyLocal(end),
  };
}

async function canDeactivateCourse(params: {
  tenantId: string;
  courseId: string;
  courseTime: string;
  hasParticipants: boolean;
  swapsTable: string;
  overridesTable: string;
  existingDates: string[];
}): Promise<boolean> {
  const now = new Date();
  if (
    hasBlockingUpcomingCourseDates(
      params.existingDates,
      params.courseTime,
      now,
      params.hasParticipants,
    )
  ) {
    return false;
  }

  const overridesResp = await client.send(
    new QueryCommand({
      TableName: params.overridesTable,
      KeyConditionExpression:
        "tenantId = :tenantId AND begins_with(courseId_date, :coursePrefix)",
      ExpressionAttributeValues: {
        ":tenantId": { S: params.tenantId },
        ":coursePrefix": { S: `${params.courseId}_` },
      },
    }),
  );
  const hasOpenOverrides = (overridesResp.Items ?? []).some((item) =>
    overrideBlocksCourseLifecycle(
      item as Record<string, { S?: string; L?: Array<{ S?: string }> }>,
      now,
      params.hasParticipants,
    ),
  );
  if (hasOpenOverrides) return false;

  const swapsResp = await client.send(
    new ScanCommand({
      TableName: params.swapsTable,
      FilterExpression:
        "tenantId = :tenantId AND (fromCourseId = :courseId OR toCourseId = :courseId) AND #status IN (:pending, :active)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":tenantId": { S: params.tenantId },
        ":courseId": { S: params.courseId },
        ":pending": { S: "pending" },
        ":active": { S: "active" },
      },
      ProjectionExpression: "tenantId",
      Limit: 1,
    }),
  );
  return (swapsResp.Items?.length ?? 0) === 0;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const swapsTable = process.env.SWAPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  if (!coursesTable || !membershipsTable || !overridesTable || !swapsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "COURSES_TABLE, MEMBERSHIPS_TABLE, OVERRIDES_TABLE, SWAPS_TABLE or TENANTS_TABLE env var is not set",
      }),
    };
  }

  const rawCourseId = event.pathParameters?.courseId?.trim();
  if (!rawCourseId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing courseId in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const resolvedPath = await resolveLegacyCourseIdFromPathSegment(
    client,
    coursesTable,
    tenantId,
    rawCourseId,
  );
  if (!resolvedPath.ok) {
    return { statusCode: resolvedPath.statusCode, body: resolvedPath.body };
  }
  const courseId = resolvedPath.legacyCourseId;

  const body = parseBody(event);
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  if (
    !Object.prototype.hasOwnProperty.call(body, "name") &&
    !Object.prototype.hasOwnProperty.call(body, "weekday") &&
    !Object.prototype.hasOwnProperty.call(body, "time") &&
    !Object.prototype.hasOwnProperty.call(body, "capacity") &&
    !Object.prototype.hasOwnProperty.call(body, "overbookLimit") &&
    !Object.prototype.hasOwnProperty.call(body, "status")
    && !Object.prototype.hasOwnProperty.call(body, "planningMode")
    && !Object.prototype.hasOwnProperty.call(body, "visibilityMode")
    && !Object.prototype.hasOwnProperty.call(body, "seriesStartDate")
    && !Object.prototype.hasOwnProperty.call(body, "seriesEndDate")
    && !Object.prototype.hasOwnProperty.call(body, "plannedEndDate")
    && !Object.prototype.hasOwnProperty.call(body, "visibleFrom")
    && !Object.prototype.hasOwnProperty.call(body, "visibleUntil")
    && !Object.prototype.hasOwnProperty.call(body, "excludedDates")
    && !Object.prototype.hasOwnProperty.call(body, "includedDates")
    && !Object.prototype.hasOwnProperty.call(body, "participants")
  ) {
    return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields provided" }) };
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const weekday = typeof body.weekday === "string" ? body.weekday.trim() : undefined;
  const time = typeof body.time === "string" ? body.time.trim() : undefined;
  const status = typeof body.status === "string" ? body.status.trim() : undefined;
  const planningMode = typeof body.planningMode === "string" ? body.planningMode.trim() : undefined;
  const visibilityMode = typeof body.visibilityMode === "string" ? body.visibilityMode.trim() : undefined;
  const seriesStartDate = typeof body.seriesStartDate === "string" ? body.seriesStartDate.trim() : undefined;
  const seriesEndDate = typeof body.seriesEndDate === "string" ? body.seriesEndDate.trim() : undefined;
  const hasPlannedEndDatePatch = Object.prototype.hasOwnProperty.call(body, "plannedEndDate");
  const visibleFrom = typeof body.visibleFrom === "string" ? body.visibleFrom.trim() : undefined;
  const visibleUntil = typeof body.visibleUntil === "string" ? body.visibleUntil.trim() : undefined;
  const excludedDates = Object.prototype.hasOwnProperty.call(body, "excludedDates")
    ? normalizeDateListInput(body.excludedDates)
    : undefined;
  const includedDates = Object.prototype.hasOwnProperty.call(body, "includedDates")
    ? normalizeDateListInput(body.includedDates)
    : undefined;
  const participants = Object.prototype.hasOwnProperty.call(body, "participants")
    ? normalizeParticipantListInput(body.participants)
    : undefined;
  const capacity =
    Object.prototype.hasOwnProperty.call(body, "capacity") && Number.isFinite(body.capacity)
      ? Number(body.capacity)
      : undefined;
  const overbookLimit =
    Object.prototype.hasOwnProperty.call(body, "overbookLimit") && Number.isFinite(body.overbookLimit)
      ? Number(body.overbookLimit)
      : undefined;

  if (Object.prototype.hasOwnProperty.call(body, "name") && !name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing course name" }) };
  }
  if (Object.prototype.hasOwnProperty.call(body, "weekday") && !weekday) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing weekday" }) };
  }
  if (Object.prototype.hasOwnProperty.call(body, "time") && (!time || !TIME_REGEX.test(time))) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid time format (expected HH:mm)" }) };
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "capacity") &&
    (capacity == null || !Number.isInteger(capacity) || capacity < 0)
  ) {
    return { statusCode: 400, body: JSON.stringify({ error: "Capacity must be a non-negative integer" }) };
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (!status || !COURSE_STATUSES.has(status)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid status value" }) };
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "planningMode")) {
    if (!planningMode || !COURSE_PLANNING_MODES.has(planningMode)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid planningMode value" }) };
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "visibilityMode")) {
    if (!visibilityMode || !COURSE_VISIBILITY_MODES.has(visibilityMode)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid visibilityMode value" }) };
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "excludedDates") && !excludedDates) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "excludedDates must contain ISO dates (YYYY-MM-DD)" }),
    };
  }
  if (Object.prototype.hasOwnProperty.call(body, "includedDates") && !includedDates) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "includedDates must contain ISO dates (YYYY-MM-DD)" }),
    };
  }
  if (Object.prototype.hasOwnProperty.call(body, "participants") && !participants) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "participants must be an array of non-empty strings" }),
    };
  }
  try {
    const membershipResp = await client.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: actorUserId },
        },
        ConsistentRead: true,
      }),
    );
    const actorRole = membershipResp.Item?.role?.S;
    const instructorOverbookOnly = actorRole === "instructor" && isInstructorOverbookOnlyPatch(body);
    if (actorRole !== "admin" && !instructorOverbookOnly) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    let rollingPlanningHorizonWeeks = 5;
    let tenantSettings;
    try {
      tenantSettings = await loadTenantSettings(client, tenantsTable, tenantId);
      rollingPlanningHorizonWeeks = resolveRollingPlanningHorizonWeeks(tenantSettings);
    } catch (error) {
      console.error("Failed to load tenant settings for rolling planning horizon:", error);
    }

    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId: { S: courseId },
        },
        ConsistentRead: true,
      }),
    );
    const item = courseResp.Item;
    if (!item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Course not found" }) };
    }

    const existingCapacity = item.capacity?.N ? Number.parseInt(item.capacity.N, 10) : 0;
    const existingOverbookLimit = item.overbookLimit?.N
      ? Number.parseInt(item.overbookLimit.N, 10)
      : 0;

    if (instructorOverbookOnly) {
      if (overbookLimit == null) {
        return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields provided" }) };
      }
      const overbookError = validateOverbookLimit(existingCapacity, overbookLimit);
      if (overbookError) {
        return { statusCode: 400, body: JSON.stringify({ error: overbookError }) };
      }
      const existingCourseUid = item.courseUid?.S?.trim() || generateCourseUid();
      const nextId = item.id?.N ? Number.parseInt(item.id.N, 10) : Number.parseInt(courseId, 10);
      await client.send(
        new PutItemCommand({
          TableName: coursesTable,
          Item: {
            ...item,
            courseUid: { S: existingCourseUid },
            overbookLimit: { N: String(overbookLimit) },
            actorUserId: { S: actorUserId },
          },
        }),
      );
      return {
        statusCode: 200,
        body: JSON.stringify({
          id: Number.isFinite(nextId) ? nextId : 0,
          courseId,
          courseUid: existingCourseUid,
          name: item.name?.S,
          weekday: item.weekday?.S,
          time: item.time?.S,
          capacity: existingCapacity,
          overbookLimit,
          status: item.status?.S ?? "active",
          participants: item.participants?.L?.map((p) => p.S).filter(Boolean) ?? [],
        }),
      };
    }

    if (Object.prototype.hasOwnProperty.call(body, "overbookLimit")) {
      const overbookError = validateOverbookLimit(capacity ?? existingCapacity, overbookLimit);
      if (overbookError) {
        return { statusCode: 400, body: JSON.stringify({ error: overbookError }) };
      }
    }

    const currentStatus = item.status?.S ?? "active";
    const currentPlanningMode = item.planningMode?.S ?? "bounded_series";
    const courseParticipants = item.participants?.L ?? [];

    if (
      Object.prototype.hasOwnProperty.call(body, "planningMode") &&
      planningMode &&
      planningMode !== currentPlanningMode &&
      isPlanningModeChangeLocked({ status: currentStatus, participants: courseParticipants })
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: PLANNING_MODE_LOCKED_MESSAGE }),
      };
    }

    const nextStatus = status ?? currentStatus;
    if (status && nextStatus !== currentStatus) {
      const hasParticipants = courseHasParticipants(courseParticipants);
      const transitionAllowed =
        (currentStatus === "inactive" && nextStatus === "draft") ||
        (currentStatus === "draft" && nextStatus === "active") ||
        (currentStatus === "active" && nextStatus === "inactive") ||
        (currentStatus === "active" && nextStatus === "draft" && !hasParticipants);
      if (!transitionAllowed) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Invalid status transition: ${currentStatus} -> ${nextStatus}` }),
        };
      }

      if (currentStatus === "active" && nextStatus === "inactive") {
        if (
          isRollingInactiveBlocked({
            status: currentStatus,
            planningMode: currentPlanningMode,
            participants: courseParticipants,
          })
        ) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: ROLLING_INACTIVE_USE_PLANNED_END_MESSAGE }),
          };
        }

        const existingFallbackDates = item.dates?.L?.map((d) => d.S ?? "").filter(Boolean) ?? [];
        const existingExcludedDates =
          item.excludedDates?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? [];
        const existingIncludedDates =
          item.includedDates?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? [];
        const derivedExistingDates = deriveVisibleDates({
          planningMode: item.planningMode?.S,
          visibilityMode: item.visibilityMode?.S,
          weekday: item.weekday?.S ?? "",
          seriesStartDate: item.seriesStartDate?.S,
          seriesEndDate: item.seriesEndDate?.S,
          plannedEndDate: item.plannedEndDate?.S,
          visibleFrom: item.visibleFrom?.S,
          visibleUntil: item.visibleUntil?.S,
          rollingPlanningHorizonWeeks:
            item.planningMode?.S === "rolling_continuous" ? rollingPlanningHorizonWeeks : undefined,
          excludedDates: existingExcludedDates,
          includedDates: existingIncludedDates,
          fallbackDates: existingFallbackDates,
        });
        const existingDates = Array.from(
          new Set([...existingFallbackDates, ...derivedExistingDates]),
        ).sort((a, b) => a.localeCompare(b));
        const canDeactivate = await canDeactivateCourse({
          tenantId,
          courseId,
          courseTime: item.time?.S ?? "",
          hasParticipants,
          swapsTable,
          overridesTable,
          existingDates,
        });
        if (!canDeactivate) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error:
                "Kurs kann nicht deaktiviert werden: Alle Termine müssen zuerst abgesagt oder geschlossen sein.",
            }),
          };
        }
      }
    }

    const nextName = name ?? item.name?.S ?? "";
    const nextWeekday = weekday ?? item.weekday?.S ?? "";
    const nextTime = time ?? item.time?.S ?? "";
    const nextCapacity = capacity ?? existingCapacity;
    const nextOverbookLimit = overbookLimit ?? existingOverbookLimit;
    const nextId = item.id?.N ? Number.parseInt(item.id.N, 10) : Number.parseInt(courseId, 10);
    const nextParticipants = participants
      ? participants.map((entry) => ({ S: entry }))
      : (item.participants?.L ?? []);
    if (participants) {
      const capacityError = validateParticipantListSize(nextParticipants.length, {
        capacity: nextCapacity,
        overbookLimit: nextOverbookLimit,
      });
      if (capacityError) {
        return { statusCode: 400, body: JSON.stringify({ error: capacityError }) };
      }
    }
    const nextPlanningMode = planningMode ?? item.planningMode?.S;
    const nextVisibilityMode = visibilityMode ?? item.visibilityMode?.S;
    const nextSeriesStartDate = seriesStartDate ?? item.seriesStartDate?.S;
    const nextSeriesEndDate = seriesEndDate ?? item.seriesEndDate?.S;
    let nextPlannedEndDate: string | undefined = item.plannedEndDate?.S;
    if (hasPlannedEndDatePatch) {
      const rawPlannedEnd = body.plannedEndDate;
      if (rawPlannedEnd == null || (typeof rawPlannedEnd === "string" && !rawPlannedEnd.trim())) {
        nextPlannedEndDate = undefined;
      } else if (typeof rawPlannedEnd === "string") {
        const trimmed = rawPlannedEnd.trim();
        if (!ISO_DATE_ONLY.test(trimmed)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: PLANNED_END_INVALID_MESSAGE }),
          };
        }
        if ((nextPlanningMode ?? item.planningMode?.S) !== "rolling_continuous") {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "plannedEndDate is only allowed for rolling_continuous courses" }),
          };
        }
        if (!isPlannedEndDateAllowed(trimmed, rollingPlanningHorizonWeeks, new Date())) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: PLANNED_END_INVALID_MESSAGE }),
          };
        }
        nextPlannedEndDate = trimmed;
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: PLANNED_END_INVALID_MESSAGE }),
        };
      }
    }
    const nextVisibleFrom = visibleFrom ?? item.visibleFrom?.S;
    const nextVisibleUntil = visibleUntil ?? item.visibleUntil?.S;
    const nextExcludedDatesRaw =
      excludedDates ?? (item.excludedDates?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? []);
    const nextIncludedDatesRaw =
      includedDates ?? (item.includedDates?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? []);
    const prunedExceptions = pruneScheduleExceptions({
      planningMode: nextPlanningMode,
      seriesStartDate: nextSeriesStartDate,
      seriesEndDate: nextSeriesEndDate,
      excludedDates: nextExcludedDatesRaw,
      includedDates: nextIncludedDatesRaw,
    });
    const nextExcludedDates = prunedExceptions.excludedDates;
    const nextIncludedDates = prunedExceptions.includedDates;
    const currentExcludedDates =
      item.excludedDates?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? [];

    if (
      (nextPlanningMode === "bounded_series" ||
        Object.prototype.hasOwnProperty.call(body, "seriesStartDate") ||
        Object.prototype.hasOwnProperty.call(body, "seriesEndDate")) &&
      !isValidDateRange(nextSeriesStartDate, nextSeriesEndDate)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "seriesStartDate and seriesEndDate are required as ISO dates with start <= end",
        }),
      };
    }
    if (
      (nextVisibilityMode === "fixed_window" ||
        Object.prototype.hasOwnProperty.call(body, "visibleFrom") ||
        Object.prototype.hasOwnProperty.call(body, "visibleUntil")) &&
      !isValidDateRange(nextVisibleFrom, nextVisibleUntil)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "visibleFrom and visibleUntil are required as ISO dates with start <= end",
        }),
      };
    }
    if (nextPlanningMode === "rolling_continuous" && nextStatus === "active") {
      const currentExcludedSet = new Set(currentExcludedDates);
      const addedExcludedDates = nextExcludedDates.filter((entry) => !currentExcludedSet.has(entry));
      const lockBounds = getRollingPlanningLockBounds(new Date(), rollingPlanningHorizonWeeks);
      const hasLockedExcludedDate = addedExcludedDates.some(
        (entry) => entry >= lockBounds.startIso && entry <= lockBounds.endIso,
      );
      if (hasLockedExcludedDate) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Termine innerhalb der nächsten ${rollingPlanningHorizonWeeks} Wochen dürfen nicht ausgeschlossen werden. Bitte stattdessen absagen.`,
          }),
        };
      }
    }

    const nextDates = deriveVisibleDates({
      planningMode: nextPlanningMode,
      visibilityMode: nextVisibilityMode,
      weekday: nextWeekday,
      seriesStartDate: nextSeriesStartDate,
      seriesEndDate: nextSeriesEndDate,
      plannedEndDate: nextPlannedEndDate,
      visibleFrom: nextVisibleFrom,
      visibleUntil: nextVisibleUntil,
      rollingPlanningHorizonWeeks:
        nextPlanningMode === "rolling_continuous" ? rollingPlanningHorizonWeeks : undefined,
      excludedDates: nextExcludedDates,
      includedDates: nextIncludedDates,
      fallbackDates: item.dates?.L?.map((entry) => entry.S ?? "").filter(Boolean) ?? [],
    });
    let effectiveStatus = nextStatus;
    if (
      nextStatus === "active" &&
      shouldAutoDeactivateCourse(
        {
          status: "active",
          planningMode: nextPlanningMode as Course["planningMode"],
          seriesEndDate: nextSeriesEndDate,
          visibleUntil: nextVisibleUntil,
          plannedEndDate: nextPlannedEndDate,
          dates: nextDates,
        },
        tenantSettings,
      )
    ) {
      effectiveStatus = "inactive";
      console.info(
        JSON.stringify({
          actor: "system",
          timestamp: new Date().toISOString(),
          courseId,
          reason: "empty_future_schedule",
          previousStatus: nextStatus,
          nextStatus: effectiveStatus,
        }),
      );
    }

    if (
      nextExcludedDates.length !== nextExcludedDatesRaw.length ||
      nextIncludedDates.length !== nextIncludedDatesRaw.length
    ) {
      console.info(
        JSON.stringify({
          actor: actorUserId,
          timestamp: new Date().toISOString(),
          courseId,
          reason: "schedule_exceptions_pruned",
          planningMode: nextPlanningMode,
          windowStart: prunedExceptions.windowStart,
          windowEnd: prunedExceptions.windowEnd,
          removedExcluded: nextExcludedDatesRaw.length - nextExcludedDates.length,
          removedIncluded: nextIncludedDatesRaw.length - nextIncludedDates.length,
        }),
      );
    }

    const existingCourseUid = item.courseUid?.S?.trim();
    const nextCourseUid = existingCourseUid || generateCourseUid();

    const updateItem: Record<string, any> = {
      tenantId: { S: tenantId },
      courseId: { S: courseId },
      courseUid: { S: nextCourseUid },
      id: { N: String(Number.isFinite(nextId) ? nextId : 0) },
      name: { S: nextName },
      weekday: { S: nextWeekday },
      time: { S: nextTime },
      capacity: { N: String(nextCapacity) },
      overbookLimit: { N: String(nextOverbookLimit) },
      status: { S: effectiveStatus },
      participants: { L: nextParticipants },
      dates: { L: nextDates.map((entry) => ({ S: entry })) },
    };
    if (nextPlanningMode) updateItem.planningMode = { S: nextPlanningMode };
    if (nextVisibilityMode) updateItem.visibilityMode = { S: nextVisibilityMode };
    if (nextSeriesStartDate) updateItem.seriesStartDate = { S: nextSeriesStartDate };
    if (nextSeriesEndDate) updateItem.seriesEndDate = { S: nextSeriesEndDate };
    if (nextPlannedEndDate) updateItem.plannedEndDate = { S: nextPlannedEndDate };
    if (nextVisibleFrom) updateItem.visibleFrom = { S: nextVisibleFrom };
    if (nextVisibleUntil) updateItem.visibleUntil = { S: nextVisibleUntil };
    if (nextExcludedDates.length > 0) {
      updateItem.excludedDates = { L: nextExcludedDates.map((entry) => ({ S: entry })) };
    }
    if (nextIncludedDates.length > 0) {
      updateItem.includedDates = { L: nextIncludedDates.map((entry) => ({ S: entry })) };
    }

    await client.send(
      new PutItemCommand({
        TableName: coursesTable,
        Item: updateItem,
      }),
    );

    if (isScheduleExceptionPatchBody(body)) {
      const reactivatedExcludedDates = resolveReactivatedExcludedDates(
        currentExcludedDates,
        nextExcludedDates,
      );
      const visibleActiveDates = resolveVisibleActiveDates(nextDates, nextExcludedDates);
      const reactivatedKeySet = new Set(
        reactivatedExcludedDates.map((date) => `${courseId}_${date}`),
      );
      const tombstoneScanDates = isScheduleWindowPatchBody(body)
        ? visibleActiveDates.filter((date) => !reactivatedKeySet.has(`${courseId}_${date}`))
        : [];
      let overrideItems: Array<Record<string, { L?: Array<{ S?: string }>; S?: string }>> = [];
      if (tombstoneScanDates.length > 0) {
        const overridesResp = await client.send(
          new QueryCommand({
            TableName: overridesTable,
            KeyConditionExpression:
              "tenantId = :tenantId AND begins_with(courseId_date, :coursePrefix)",
            ExpressionAttributeValues: {
              ":tenantId": { S: tenantId },
              ":coursePrefix": { S: `${courseId}_` },
            },
          }),
        );
        overrideItems = (overridesResp.Items ?? []) as Array<
          Record<string, { L?: Array<{ S?: string }>; S?: string }>
        >;
      }
      const overrideKeysToDelete = collectOverrideKeysForReactivationCleanup({
        courseId,
        reactivatedExcludedDates,
        visibleActiveDatesForTombstoneScan: tombstoneScanDates,
        overrideItems,
      });
      if (overrideKeysToDelete.length > 0) {
        console.info(
          JSON.stringify({
            actor: actorUserId,
            timestamp: new Date().toISOString(),
            courseId,
            reason: "term_reactivated_override_cleanup",
            overrideKeys: overrideKeysToDelete,
            reactivatedExcludedDates,
          }),
        );
        await Promise.all(
          overrideKeysToDelete.map((courseId_date) =>
            client.send(
              new DeleteItemCommand({
                TableName: overridesTable,
                Key: {
                  tenantId: { S: tenantId },
                  courseId_date: { S: courseId_date },
                },
              }),
            ),
          ),
        );
      }
    }

    const previousPlannedEndDate = item.plannedEndDate?.S;
    const isRollingActiveWithParticipants =
      (nextPlanningMode ?? item.planningMode?.S) === "rolling_continuous" &&
      effectiveStatus === "active" &&
      nextParticipants.length > 0;

    let plannedEndNotifyChange: "set" | "cleared" | null = null;
    let plannedEndNotifyDateIso: string | undefined;
    if (hasPlannedEndDatePatch && isRollingActiveWithParticipants) {
      if (nextPlannedEndDate && previousPlannedEndDate !== nextPlannedEndDate) {
        plannedEndNotifyChange = "set";
        plannedEndNotifyDateIso = nextPlannedEndDate;
      } else if (!nextPlannedEndDate && previousPlannedEndDate) {
        plannedEndNotifyChange = "cleared";
        plannedEndNotifyDateIso = previousPlannedEndDate;
      }
    }

    if (plannedEndNotifyChange && plannedEndNotifyDateIso) {
      const participantsTable = process.env.PARTICIPANTS_TABLE;
      const sesSourceEmail = process.env.SES_SOURCE_EMAIL;
      const baseUrlEnv = process.env.BASE_URL || "";
      const loginUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : baseUrlEnv ? `https://${baseUrlEnv}` : undefined;
      const participantUserIds = nextParticipants
        .map((entry) => entry.S ?? "")
        .filter((entry) => entry.length > 0);
      try {
        const mailSummary = await notifyParticipantsPlannedEndDate(client, {
          participantsTable,
          sesSourceEmail,
          mailLocale: process.env.MAIL_LOCALE || "de",
          loginUrl,
          tenantId,
          courseName: nextName,
          change: plannedEndNotifyChange,
          plannedEndDateIso: plannedEndNotifyDateIso,
          participantUserIds,
        });
        console.info("updateCourse plannedEndDate mail summary", {
          tenantId,
          courseId,
          change: plannedEndNotifyChange,
          plannedEndDate: plannedEndNotifyDateIso,
          ...mailSummary,
        });
      } catch (notificationError) {
        console.warn("updateCourse plannedEndDate notification failed", {
          tenantId,
          courseId,
          error: notificationError,
        });
      }
    }

    if (participants && effectiveStatus === "active") {
      const previousParticipants =
        item.participants?.L?.map((entry) => entry.S ?? "").filter((entry) => entry.length > 0) ?? [];
      const previousParticipantsSet = new Set(previousParticipants.map((entry) => entry.toLowerCase()));
      const addedParticipants = participants.filter(
        (entry) => !previousParticipantsSet.has(entry.toLowerCase()),
      );
      if (addedParticipants.length > 0) {
        const overridesResp = await client.send(
          new QueryCommand({
            TableName: overridesTable,
            KeyConditionExpression:
              "tenantId = :tenantId AND begins_with(courseId_date, :coursePrefix)",
            ExpressionAttributeValues: {
              ":tenantId": { S: tenantId },
              ":coursePrefix": { S: `${courseId}_` },
            },
          }),
        );
        const now = new Date();
        for (const overrideItem of overridesResp.Items ?? []) {
          const overrideDate = overrideItem.date?.S;
          if (!overrideDate) continue;
          if (!isCourseInFutureWithBuffer(overrideDate, nextTime, now)) continue;
          const currentOverrideParticipants =
            overrideItem.participants?.L?.map((entry) => entry.S ?? "").filter((entry) => entry.length > 0) ?? [];
          const currentOverrideSet = new Set(currentOverrideParticipants.map((entry) => entry.toLowerCase()));
          const participantsToAdd = addedParticipants.filter(
            (entry) => !currentOverrideSet.has(entry.toLowerCase()),
          );
          if (participantsToAdd.length === 0) continue;
          await client.send(
            new PutItemCommand({
              TableName: overridesTable,
              Item: {
                ...overrideItem,
                courseUid: { S: nextCourseUid },
                participants: {
                  L: [...currentOverrideParticipants, ...participantsToAdd].map((entry) => ({ S: entry })),
                },
                actorUserId: { S: actorUserId },
              },
            }),
          );
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: Number.isFinite(nextId) ? nextId : 0,
        courseId,
        courseUid: nextCourseUid,
        name: nextName,
        weekday: nextWeekday,
        time: nextTime,
        capacity: nextCapacity,
        overbookLimit: nextOverbookLimit,
        status: effectiveStatus,
        planningMode: nextPlanningMode,
        visibilityMode: nextVisibilityMode,
        seriesStartDate: nextSeriesStartDate,
        seriesEndDate: nextSeriesEndDate,
        plannedEndDate: nextPlannedEndDate,
        visibleFrom: nextVisibleFrom,
        visibleUntil: nextVisibleUntil,
        excludedDates: nextExcludedDates,
        includedDates: nextIncludedDates,
        visibleDates: nextDates,
        participants: nextParticipants.map((p) => p.S).filter(Boolean),
        dates: nextDates,
      }),
    };
  } catch (error) {
    console.error("Error updating course:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to update course" }) };
  }
};
