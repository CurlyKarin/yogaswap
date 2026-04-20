import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { deriveVisibleDates } from "../shared/courseDates";

const client = dynamoClient;

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
    console.log('getCourses tenant context', { tenantId, userId });

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tid", // :tid = Platzhalter für tenantId (PK)
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const items = result.Items || [];
    if (items.length === 0) {
      console.log(
        "getCourses: Query returned 0 items for tenantId=",
        tenantId,
      );
    }
    const courses = items.map((item) => {
      const fallbackDates = item.dates?.L ? item.dates.L.map((d: any) => d.S).filter(Boolean) : [];
      const excludedDates = item.excludedDates?.L
        ? item.excludedDates.L.map((d: any) => d.S).filter(Boolean)
        : [];
      const includedDates = item.includedDates?.L
        ? item.includedDates.L.map((d: any) => d.S).filter(Boolean)
        : [];
      const planningMode = item.planningMode?.S;
      const visibilityMode = item.visibilityMode?.S;
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
      });

      return {
        id: Number(item.id?.N ?? item.courseId?.S ?? 0),
        courseId: item.courseId?.S,
        name: item.name.S!,
        weekday: item.weekday.S!,
        time: item.time.S!,
        capacity: Number(item.capacity.N!),
        status: item.status?.S ?? "active",
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
        participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
        dates: visibleDates,
      };
    });

    return { statusCode: 200, body: JSON.stringify(courses) };
  } catch (error) {
    console.error('Error getting courses:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to get courses' }) };
  }
};