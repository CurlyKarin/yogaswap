import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;
const COURSE_STATUSES = new Set(["inactive", "draft", "active"]);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

type UpdateCourseBody = {
  name?: string;
  weekday?: string;
  time?: string;
  capacity?: number;
  status?: string;
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

function isFutureOrTodayDateString(isoDate: string, now: Date): boolean {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date >= startOfToday;
}

function hasAnyListEntries(item: Record<string, { L?: Array<{ S?: string }> }>): boolean {
  const participantsCount = item.participants?.L?.length ?? 0;
  const swappedCount = item.swapped?.L?.length ?? 0;
  const waitlistCount = item.waitlist?.L?.length ?? 0;
  return participantsCount > 0 || swappedCount > 0 || waitlistCount > 0;
}

async function canDeactivateCourse(params: {
  tenantId: string;
  courseId: string;
  swapsTable: string;
  overridesTable: string;
  existingDates: string[];
}): Promise<boolean> {
  const now = new Date();
  const hasUpcomingDates = params.existingDates.some((date) =>
    isFutureOrTodayDateString(date, now),
  );
  if (hasUpcomingDates) return false;

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
  const hasOpenOverrides = (overridesResp.Items ?? []).some((item) => {
    const dateValue = item.date?.S;
    if (!dateValue || !isFutureOrTodayDateString(dateValue, now)) return false;
    return hasAnyListEntries(item as Record<string, { L?: Array<{ S?: string }> }>);
  });
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
  if (!coursesTable || !membershipsTable || !overridesTable || !swapsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "COURSES_TABLE, MEMBERSHIPS_TABLE, OVERRIDES_TABLE or SWAPS_TABLE env var is not set",
      }),
    };
  }

  const courseId = event.pathParameters?.courseId?.trim();
  if (!courseId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing courseId in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const body = parseBody(event);
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  if (
    !Object.prototype.hasOwnProperty.call(body, "name") &&
    !Object.prototype.hasOwnProperty.call(body, "weekday") &&
    !Object.prototype.hasOwnProperty.call(body, "time") &&
    !Object.prototype.hasOwnProperty.call(body, "capacity") &&
    !Object.prototype.hasOwnProperty.call(body, "status")
  ) {
    return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields provided" }) };
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const weekday = typeof body.weekday === "string" ? body.weekday.trim() : undefined;
  const time = typeof body.time === "string" ? body.time.trim() : undefined;
  const status = typeof body.status === "string" ? body.status.trim() : undefined;
  const capacity =
    Object.prototype.hasOwnProperty.call(body, "capacity") && Number.isFinite(body.capacity)
      ? Number(body.capacity)
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

    const currentStatus = item.status?.S ?? "active";
    const nextStatus = status ?? currentStatus;
    if (status && nextStatus !== currentStatus) {
      const transitionAllowed =
        (currentStatus === "inactive" && nextStatus === "draft") ||
        (currentStatus === "draft" && nextStatus === "active") ||
        (currentStatus === "active" && nextStatus === "inactive");
      if (!transitionAllowed) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Invalid status transition: ${currentStatus} -> ${nextStatus}` }),
        };
      }

      if (currentStatus === "active" && nextStatus === "inactive") {
        const existingDates = item.dates?.L?.map((d) => d.S ?? "").filter(Boolean) ?? [];
        const canDeactivate = await canDeactivateCourse({
          tenantId,
          courseId,
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
    const nextCapacity =
      capacity ??
      (item.capacity?.N ? Number.parseInt(item.capacity.N, 10) : 0);
    const nextId = item.id?.N ? Number.parseInt(item.id.N, 10) : Number.parseInt(courseId, 10);
    const nextParticipants = item.participants?.L ?? [];
    const nextDates = item.dates?.L ?? [];

    await client.send(
      new PutItemCommand({
        TableName: coursesTable,
        Item: {
          tenantId: { S: tenantId },
          courseId: { S: courseId },
          id: { N: String(Number.isFinite(nextId) ? nextId : 0) },
          name: { S: nextName },
          weekday: { S: nextWeekday },
          time: { S: nextTime },
          capacity: { N: String(nextCapacity) },
          status: { S: nextStatus },
          participants: { L: nextParticipants },
          dates: { L: nextDates },
        },
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: Number.isFinite(nextId) ? nextId : 0,
        courseId,
        name: nextName,
        weekday: nextWeekday,
        time: nextTime,
        capacity: nextCapacity,
        status: nextStatus,
        participants: nextParticipants.map((p) => p.S).filter(Boolean),
        dates: nextDates.map((d) => d.S).filter(Boolean),
      }),
    };
  } catch (error) {
    console.error("Error updating course:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to update course" }) };
  }
};
