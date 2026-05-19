import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { resolveLegacyCourseIdFromPathSegment } from "../shared/courseUid";
import { getTenantContext } from "../shared/tenantContext";
import {
  hasBlockingUpcomingCourseDates,
  overrideBlocksCourseLifecycle,
} from "../shared/courseLifecycle";

const client = dynamoClient;

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

  const rawCourseId = event.pathParameters?.courseId?.trim();
  if (!rawCourseId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing courseId in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
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

    const status = item.status?.S ?? "active";
    if (status !== "inactive") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Kurs kann nicht gelöscht werden: Nur deaktivierte Kurse ohne offene Termin-/Tauschbezüge sind löschbar.",
        }),
      };
    }

    const participantsCount = item.participants?.L?.length ?? 0;
    if (participantsCount > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Kurs kann nicht gelöscht werden: Nur deaktivierte Kurse ohne offene Termin-/Tauschbezüge sind löschbar.",
        }),
      };
    }

    const now = new Date();
    const courseTime = item.time?.S ?? "";
    const storedDates = (item.dates?.L ?? []).map((d) => d.S ?? "").filter(Boolean);
    if (hasBlockingUpcomingCourseDates(storedDates, courseTime, now, participantsCount > 0)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Kurs kann nicht gelöscht werden: Nur deaktivierte Kurse ohne offene Termin-/Tauschbezüge sind löschbar.",
        }),
      };
    }

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
    const hasOpenOverrides = (overridesResp.Items ?? []).some((overrideItem) =>
      overrideBlocksCourseLifecycle(
        overrideItem as Record<string, { S?: string; L?: Array<{ S?: string }> }>,
        now,
        participantsCount > 0,
      ),
    );
    if (hasOpenOverrides) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Kurs kann nicht gelöscht werden: Nur deaktivierte Kurse ohne offene Termin-/Tauschbezüge sind löschbar.",
        }),
      };
    }

    const swapsResp = await client.send(
      new ScanCommand({
        TableName: swapsTable,
        FilterExpression:
          "tenantId = :tenantId AND (fromCourseId = :courseId OR toCourseId = :courseId) AND #status IN (:pending, :active)",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
          ":courseId": { S: courseId },
          ":pending": { S: "pending" },
          ":active": { S: "active" },
        },
        ProjectionExpression: "tenantId",
        Limit: 1,
      }),
    );
    if ((swapsResp.Items?.length ?? 0) > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Kurs kann nicht gelöscht werden: Nur deaktivierte Kurse ohne offene Termin-/Tauschbezüge sind löschbar.",
        }),
      };
    }

    await client.send(
      new DeleteItemCommand({
        TableName: coursesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId: { S: courseId },
        },
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, courseId }),
    };
  } catch (error) {
    console.error("Error deleting course:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to delete course" }) };
  }
};
