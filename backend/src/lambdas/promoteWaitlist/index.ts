import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  isSwapTargetInCutoffWindow,
  resolveEffectiveTermOccupancy,
  type Course,
  type CourseDateOverride,
  type CourseEnrollment,
  type Swap,
  type UserTenantMembership,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import { resolveLegacyCourseIdFromPathSegment } from "../shared/courseUid";
import { loadTenantSettings } from "../shared/tenantSettingsLoader";
import { canManageParticipants } from "../shared/permissions";
import { mapOverrideItem } from "../shared/overrideDynamo";
import { courseCapacityFromDynamoItem } from "../shared/courseCapacityDynamo";
import { queryCourseEnrollments } from "../shared/courseEnrollmentDynamo";
import { dynamoItemToSwap } from "../shared/swapDynamo";
import { gateStaffOccupancy } from "../shared/staffCapacityGate";
import { activatePendingWaitlistSwap } from "../shared/waitlistPromotionActivation";

const client = dynamoClient;

type PromoteBody = {
  participantId?: string;
  confirmExceedMaxCapacity?: boolean;
  acknowledgeCutoff?: boolean;
};

function parseBody(event: APIGatewayProxyEvent): PromoteBody {
  if (!event.body) return {};
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as PromoteBody;
  } catch {
    return {};
  }
}

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function includesUserCaseInsensitive(values: string[] | undefined, user: string): boolean {
  if (!values) return false;
  const target = normalized(user);
  return values.some((entry) => normalized(entry) === target);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const swapsTable = process.env.SWAPS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  const enrollmentsTable = process.env.COURSE_ENROLLMENTS_TABLE;

  if (!coursesTable || !overridesTable || !swapsTable || !membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Required env vars are missing for promoteWaitlist" }),
    };
  }

  const rawCourseId = event.pathParameters?.courseId?.trim();
  const date = event.pathParameters?.date?.trim();
  if (!rawCourseId || !date) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing courseId or date in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const body = parseBody(event);
  const participantId =
    typeof body.participantId === "string" ? body.participantId.trim() : "";
  if (!participantId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "participantId is required" }),
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
    if (actorRole !== "admin" && actorRole !== "instructor") {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const tenantSettings = await loadTenantSettings(client, tenantsTable, tenantId);
    const membership: UserTenantMembership = {
      tenantId,
      userId: actorUserId,
      role: actorRole,
    };
    if (!canManageParticipants(membership, tenantSettings)) {
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
    const courseId = Number(resolvedPath.legacyCourseId);

    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId: { S: resolvedPath.legacyCourseId },
        },
        ConsistentRead: true,
      }),
    );
    if (!courseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Course not found" }) };
    }
    const targetCourse: Course = {
      id: courseId,
      name: courseResp.Item.name?.S ?? `Kurs ${courseId}`,
      weekday: courseResp.Item.weekday?.S ?? "",
      time: courseResp.Item.time?.S ?? "",
      capacity: Number(courseResp.Item.capacity?.N ?? 0),
      overbookLimit: courseResp.Item.overbookLimit?.N
        ? Number(courseResp.Item.overbookLimit.N)
        : 0,
      participants: courseResp.Item.participants?.L
        ? courseResp.Item.participants.L.map((p) => p.S ?? "").filter(Boolean)
        : [],
      dates: courseResp.Item.dates?.L
        ? courseResp.Item.dates.L.map((d) => d.S ?? "").filter(Boolean)
        : [],
    };
    const capacityFields = courseCapacityFromDynamoItem(courseResp.Item);
    const courseTime = targetCourse.time;

    const overrideResp = await client.send(
      new GetItemCommand({
        TableName: overridesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId_date: { S: `${courseId}_${date}` },
        },
        ConsistentRead: true,
      }),
    );
    if (!overrideResp.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Kein Override mit Warteliste für diesen Termin." }),
      };
    }
    const targetOverride = mapOverrideItem(overrideResp.Item);
    targetOverride.courseId = courseId;
    targetOverride.date = date;

    if (!includesUserCaseInsensitive(targetOverride.waitlist, participantId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Die Person steht nicht auf der Warteliste dieses Termins.",
        }),
      };
    }

    const pendingSwapsData = await client.send(
      new QueryCommand({
        TableName: swapsTable,
        KeyConditionExpression: "tenantId = :tid",
        FilterExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":tid": { S: tenantId }, ":s": { S: "pending" } },
        ConsistentRead: true,
      }),
    );
    const pendingSwaps: Swap[] = (pendingSwapsData.Items || [])
      .map((item) => dynamoItemToSwap(item))
      .filter((swap): swap is Swap => swap != null);

    const correspondingSwap = pendingSwaps.find(
      (s) =>
        normalized(s.participantId) === normalized(participantId) &&
        s.toCourseId === courseId &&
        s.toDate === date,
    );
    if (!correspondingSwap) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Kein offener Tausch (pending) für diese Wartelisten-Person gefunden.",
        }),
      };
    }

    const allEnrollments: CourseEnrollment[] = enrollmentsTable
      ? await queryCourseEnrollments({
          client,
          tableName: enrollmentsTable,
          tenantId,
        })
      : [];

    const participantCount = resolveEffectiveTermOccupancy(
      targetCourse,
      targetOverride,
      allEnrollments,
      date,
    ).participants.length;
    const guestCount = targetOverride.anonymousTrialCount ?? 0;

    // Staff-Promote: Belegung nach Übernahme = +1 benannte Person
    const gate = gateStaffOccupancy({
      participantCount: participantCount + 1,
      course: capacityFields,
      guestCount,
      tenantSettings,
      confirmExceedMaxCapacity: body.confirmExceedMaxCapacity === true,
    });
    if (!gate.ok) {
      return { statusCode: gate.statusCode, body: JSON.stringify(gate.body) };
    }

    const inCutoff = isSwapTargetInCutoffWindow(date, courseTime, tenantSettings);
    if (inCutoff && body.acknowledgeCutoff !== true) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "Dieser Termin liegt kurz vor Kursbeginn (Absagefrist).",
          code: "cutoff_needs_ack",
        }),
      };
    }

    const coursesData = await client.send(
      new QueryCommand({
        TableName: coursesTable,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    const courses: Course[] = (coursesData.Items || []).map((item) => ({
      id: Number(item.id?.N ?? item.courseId?.S ?? 0),
      name: item.name?.S ?? "",
      weekday: item.weekday?.S ?? "",
      time: item.time?.S ?? "",
      capacity: Number(item.capacity?.N ?? 0),
      overbookLimit: item.overbookLimit?.N ? Number(item.overbookLimit.N) : 0,
      participants: item.participants?.L
        ? item.participants.L.map((p) => p.S ?? "").filter(Boolean)
        : [],
      dates: item.dates?.L ? item.dates.L.map((d) => d.S ?? "").filter(Boolean) : [],
    }));

    const overridesData = await client.send(
      new QueryCommand({
        TableName: overridesTable,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    const allOverrides: CourseDateOverride[] = (overridesData.Items || []).map((item) =>
      mapOverrideItem(item),
    );

    await activatePendingWaitlistSwap({
      client,
      tenantId,
      actorUserId,
      correspondingSwap,
      targetOverride,
      targetCourse,
      allOverrides,
      courses,
      allEnrollments,
      pendingSwaps,
    });

    // Frische Daten für die App
    const updatedSwapsData = await client.send(
      new QueryCommand({
        TableName: swapsTable,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    const updatedSwaps: Swap[] = (updatedSwapsData.Items || [])
      .map((item) => dynamoItemToSwap(item))
      .filter((swap): swap is Swap => swap != null);

    const updatedOverridesData = await client.send(
      new QueryCommand({
        TableName: overridesTable,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    const updatedOverrides: CourseDateOverride[] = (updatedOverridesData.Items || []).map((item) =>
      mapOverrideItem(item),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Wartelisten-Person übernommen",
        promotedParticipantId: correspondingSwap.participantId,
        promotedBy: actorUserId,
        acknowledgedCutoff: inCutoff,
        exceededMaxCapacity: gate.evaluation.status === "needs_confirm",
        swaps: updatedSwaps,
        overrides: updatedOverrides,
      }),
    };
  } catch (err) {
    console.error("promoteWaitlist failed", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
