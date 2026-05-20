import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import {
  deriveVisibleDates,
  hasUpcomingCourseOccurrences,
  pruneScheduleExceptions,
} from "../shared/courseDates";
import { generateCourseUid } from "../shared/courseUid";
import {
  loadTenantSettings,
  resolveRollingExcludeLockWeeks,
} from "../shared/tenantSettingsLoader";

const client = dynamoClient;
const COURSE_STATUSES = new Set(["inactive", "draft", "active"]);
const COURSE_PLANNING_MODES = new Set(["bounded_series", "rolling_continuous"]);
const COURSE_VISIBILITY_MODES = new Set(["fixed_window", "rolling_horizon"]);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type CreateCourseBody = {
  name?: string;
  weekday?: string;
  time?: string;
  capacity?: number;
  status?: string;
  planningMode?: string;
  visibilityMode?: string;
  seriesStartDate?: string;
  seriesEndDate?: string;
  visibleFrom?: string;
  visibleUntil?: string;
  visibilityHorizonWeeks?: number;
  excludedDates?: string[];
  includedDates?: string[];
};

function parseBody(event: APIGatewayProxyEvent): CreateCourseBody | null {
  if (!event.body) return null;
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as CreateCourseBody;
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

function isValidDateRange(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  if (!ISO_DATE_ONLY.test(start) || !ISO_DATE_ONLY.test(end)) return false;
  return start <= end;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  if (!coursesTable || !membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "COURSES_TABLE, MEMBERSHIPS_TABLE or TENANTS_TABLE env var is not set",
      }),
    };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const body = parseBody(event);
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const weekday = typeof body.weekday === "string" ? body.weekday.trim() : "";
  const time = typeof body.time === "string" ? body.time.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "draft";
  const planningMode =
    typeof body.planningMode === "string" ? body.planningMode.trim() : undefined;
  const visibilityMode =
    typeof body.visibilityMode === "string" ? body.visibilityMode.trim() : undefined;
  const seriesStartDate =
    typeof body.seriesStartDate === "string" ? body.seriesStartDate.trim() : undefined;
  const seriesEndDate =
    typeof body.seriesEndDate === "string" ? body.seriesEndDate.trim() : undefined;
  const visibleFrom =
    typeof body.visibleFrom === "string" ? body.visibleFrom.trim() : undefined;
  const visibleUntil =
    typeof body.visibleUntil === "string" ? body.visibleUntil.trim() : undefined;
  const visibilityHorizonWeeks =
    Number.isFinite(body.visibilityHorizonWeeks) ? Number(body.visibilityHorizonWeeks) : undefined;
  const excludedDatesInput = normalizeDateListInput(body.excludedDates);
  const includedDatesInput = normalizeDateListInput(body.includedDates);
  const capacity = Number.isFinite(body.capacity) ? Number(body.capacity) : NaN;

  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing course name" }) };
  }
  if (!weekday) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing weekday" }) };
  }
  if (!TIME_REGEX.test(time)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid time format (expected HH:mm)" }) };
  }
  if (!Number.isInteger(capacity) || capacity < 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Capacity must be a non-negative integer" }) };
  }
  if (!COURSE_STATUSES.has(status)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid status value" }) };
  }
  if (planningMode && !COURSE_PLANNING_MODES.has(planningMode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid planningMode value" }) };
  }
  if (visibilityMode && !COURSE_VISIBILITY_MODES.has(visibilityMode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid visibilityMode value" }) };
  }
  if ((planningMode === "bounded_series" || seriesStartDate || seriesEndDate) && !isValidDateRange(seriesStartDate, seriesEndDate)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "seriesStartDate and seriesEndDate are required as ISO dates with start <= end",
      }),
    };
  }
  if ((visibilityMode === "fixed_window" || visibleFrom || visibleUntil) && !isValidDateRange(visibleFrom, visibleUntil)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "visibleFrom and visibleUntil are required as ISO dates with start <= end",
      }),
    };
  }
  if (!excludedDatesInput || !includedDatesInput) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "excludedDates/includedDates must contain ISO dates (YYYY-MM-DD)" }),
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
    if (actorRole !== "admin") {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    let rollingExcludeLockWeeks = 5;
    try {
      const tenantSettings = await loadTenantSettings(client, tenantsTable, tenantId);
      rollingExcludeLockWeeks = resolveRollingExcludeLockWeeks(tenantSettings);
    } catch (error) {
      console.error("Failed to load tenant settings for rolling lock weeks:", error);
    }

    if (
      (visibilityMode === "rolling_horizon" || visibilityHorizonWeeks != null) &&
      (!Number.isInteger(visibilityHorizonWeeks) ||
        (visibilityHorizonWeeks ?? 0) < rollingExcludeLockWeeks)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `visibilityHorizonWeeks must be an integer >= ${rollingExcludeLockWeeks}`,
        }),
      };
    }

    const prunedExceptions = pruneScheduleExceptions({
      planningMode,
      seriesStartDate,
      seriesEndDate,
      visibilityHorizonWeeks,
      excludedDates: excludedDatesInput,
      includedDates: includedDatesInput,
    });
    const excludedDates = prunedExceptions.excludedDates;
    const includedDates = prunedExceptions.includedDates;

    const coursesResp = await client.send(
      new QueryCommand({
        TableName: coursesTable,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ProjectionExpression: "courseId, id",
      }),
    );

    const maxId = (coursesResp.Items ?? []).reduce((acc, item) => {
      const courseIdRaw = item.courseId?.S;
      const idRaw = item.id?.N;
      const parsedId = Number.parseInt(courseIdRaw ?? idRaw ?? "", 10);
      return Number.isFinite(parsedId) ? Math.max(acc, parsedId) : acc;
    }, 0);
    const nextId = maxId + 1;
    const nextCourseId = String(nextId);
    const newCourseUid = generateCourseUid();
    const visibleDates = deriveVisibleDates({
      planningMode,
      visibilityMode,
      weekday,
      seriesStartDate,
      seriesEndDate,
      visibleFrom,
      visibleUntil,
      visibilityHorizonWeeks,
      excludedDates,
      includedDates,
      fallbackDates: [],
    });
    const hasUpcomingOccurrences = hasUpcomingCourseOccurrences(visibleDates, time, new Date());
    const effectiveStatus =
      status === "active" && planningMode === "bounded_series" && !hasUpcomingOccurrences
        ? "inactive"
        : status;
    if (effectiveStatus !== status) {
      console.info(
        JSON.stringify({
          actor: "system",
          timestamp: new Date().toISOString(),
          courseId: nextCourseId,
          reason: "empty_future_schedule",
          previousStatus: status,
          nextStatus: effectiveStatus,
        }),
      );
    }

    const item: Record<string, any> = {
      tenantId: { S: tenantId },
      courseId: { S: nextCourseId },
      courseUid: { S: newCourseUid },
      id: { N: String(nextId) },
      name: { S: name },
      weekday: { S: weekday },
      time: { S: time },
      capacity: { N: String(capacity) },
      status: { S: effectiveStatus },
      participants: { L: [] },
      dates: { L: visibleDates.map((entry) => ({ S: entry })) },
    };
    if (planningMode) item.planningMode = { S: planningMode };
    if (visibilityMode) item.visibilityMode = { S: visibilityMode };
    if (seriesStartDate) item.seriesStartDate = { S: seriesStartDate };
    if (seriesEndDate) item.seriesEndDate = { S: seriesEndDate };
    if (visibleFrom) item.visibleFrom = { S: visibleFrom };
    if (visibleUntil) item.visibleUntil = { S: visibleUntil };
    if (visibilityHorizonWeeks != null) {
      item.visibilityHorizonWeeks = { N: String(visibilityHorizonWeeks) };
    }
    if (excludedDates.length > 0) {
      item.excludedDates = { L: excludedDates.map((entry) => ({ S: entry })) };
    }
    if (includedDates.length > 0) {
      item.includedDates = { L: includedDates.map((entry) => ({ S: entry })) };
    }

    await client.send(
      new PutItemCommand({
        TableName: coursesTable,
        Item: item,
        ConditionExpression: "attribute_not_exists(courseId)",
      }),
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        id: nextId,
        courseId: nextCourseId,
        courseUid: newCourseUid,
        name,
        weekday,
        time,
        capacity,
        status: effectiveStatus,
        planningMode,
        visibilityMode,
        seriesStartDate,
        seriesEndDate,
        visibleFrom,
        visibleUntil,
        visibilityHorizonWeeks,
        excludedDates,
        includedDates,
        visibleDates,
        participants: [],
        dates: visibleDates,
      }),
    };
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === "ConditionalCheckFailedException") {
      return { statusCode: 409, body: JSON.stringify({ error: "Course ID collision, retry request" }) };
    }
    console.error("Error creating course:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to create course" }) };
  }
};
