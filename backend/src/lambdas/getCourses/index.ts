import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { deriveVisibleDates } from "../shared/courseDates";
import { computeCourseReconcile } from "../shared/courseReconcile";

const client = dynamoClient;

function mapItemToCourseResponse(
  item: Record<string, AttributeValue>,
  visibleDates: string[],
  effectiveStatus: string,
) {
  const excludedDates = item.excludedDates?.L
    ? item.excludedDates.L.map((d) => d.S).filter(Boolean) as string[]
    : [];
  const includedDates = item.includedDates?.L
    ? item.includedDates.L.map((d) => d.S).filter(Boolean) as string[]
    : [];
  const planningMode = item.planningMode?.S;
  const visibilityMode = item.visibilityMode?.S;

  return {
    id: Number(item.id?.N ?? item.courseId?.S ?? 0),
    courseId: item.courseId?.S,
    ...(item.courseUid?.S ? { courseUid: item.courseUid.S } : {}),
    name: item.name.S!,
    weekday: item.weekday.S!,
    time: item.time.S!,
    capacity: Number(item.capacity.N!),
    status: effectiveStatus,
    planningMode,
    visibilityMode,
    seriesStartDate: item.seriesStartDate?.S,
    seriesEndDate: item.seriesEndDate?.S,
    visibleFrom: item.visibleFrom?.S,
    visibleUntil: item.visibleUntil?.S,
    visibilityHorizonWeeks: item.visibilityHorizonWeeks?.N
      ? Number(item.visibilityHorizonWeeks.N)
      : undefined,
    excludedDates,
    includedDates,
    visibleDates,
    participants: item.participants?.L
      ? item.participants.L.map((p) => p.S).filter(Boolean)
      : [],
    dates: visibleDates,
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.COURSES_TABLE;

  if (!tableName) {
    console.error("COURSES_TABLE env var is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "COURSES_TABLE env var is not set" }),
    };
  }

  try {
    const { tenantId, userId } = getTenantContext(event);
    console.log("getCourses tenant context", { tenantId, userId });

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const items = result.Items || [];
    if (items.length === 0) {
      console.log("getCourses: Query returned 0 items for tenantId=", tenantId);
    }

    const now = new Date();
    const courses = [];

    for (const item of items) {
      const fallbackDates = item.dates?.L
        ? item.dates.L.map((d) => d.S).filter(Boolean) as string[]
        : [];
      const excludedDates = item.excludedDates?.L
        ? item.excludedDates.L.map((d) => d.S).filter(Boolean) as string[]
        : [];
      const includedDates = item.includedDates?.L
        ? item.includedDates.L.map((d) => d.S).filter(Boolean) as string[]
        : [];
      const planningMode = item.planningMode?.S;
      const visibilityMode = item.visibilityMode?.S;
      const storedStatus = item.status?.S ?? "active";

      const visibleDates = deriveVisibleDates({
        planningMode,
        visibilityMode,
        weekday: item.weekday?.S ?? "",
        seriesStartDate: item.seriesStartDate?.S,
        seriesEndDate: item.seriesEndDate?.S,
        visibleFrom: item.visibleFrom?.S,
        visibleUntil: item.visibleUntil?.S,
        visibilityHorizonWeeks: item.visibilityHorizonWeeks?.N
          ? Number(item.visibilityHorizonWeeks.N)
          : undefined,
        excludedDates,
        includedDates,
        fallbackDates,
        now,
      });

      const reconcile = computeCourseReconcile({
        storedStatus,
        planningMode,
        visibleDates,
        storedDates: fallbackDates,
        now,
      });

      if (reconcile.shouldPersist) {
        const persistedItem: Record<string, AttributeValue> = {
          ...item,
          status: { S: reconcile.effectiveStatus },
          dates: { L: reconcile.visibleDates.map((entry) => ({ S: entry })) },
        };
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: persistedItem,
          }),
        );
        if (reconcile.statusChanged) {
          console.info(
            JSON.stringify({
              actor: "system",
              timestamp: now.toISOString(),
              courseId: item.courseId?.S,
              reason: "empty_future_schedule",
              source: "getCourses_reconcile",
              previousStatus: storedStatus,
              nextStatus: reconcile.effectiveStatus,
            }),
          );
        }
        if (reconcile.datesChanged) {
          console.info(
            JSON.stringify({
              actor: "system",
              timestamp: now.toISOString(),
              courseId: item.courseId?.S,
              reason: "derived_dates_sync",
              source: "getCourses_reconcile",
            }),
          );
        }
      }

      courses.push(
        mapItemToCourseResponse(item, reconcile.visibleDates, reconcile.effectiveStatus),
      );
    }

    return { statusCode: 200, body: JSON.stringify(courses) };
  } catch (error) {
    console.error("Error getting courses:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to get courses" }) };
  }
};
