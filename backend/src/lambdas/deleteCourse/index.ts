import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

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
    const hasUpcomingDates = (item.dates?.L ?? []).some((d) =>
      d.S ? isFutureOrTodayDateString(d.S, now) : false,
    );
    if (hasUpcomingDates) {
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
    const hasOpenOverrides = (overridesResp.Items ?? []).some((overrideItem) => {
      const dateValue = overrideItem.date?.S;
      if (!dateValue || !isFutureOrTodayDateString(dateValue, now)) return false;
      return hasAnyListEntries(
        overrideItem as unknown as Record<string, { L?: Array<{ S?: string }> }>,
      );
    });
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
