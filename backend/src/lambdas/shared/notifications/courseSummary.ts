import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export type CourseSummary = {
  name: string;
  time: string;
  weekday?: string;
  instructors: string[];
};

export async function loadCourseSummary(
  client: DynamoDBClient,
  coursesTable: string,
  tenantId: string,
  legacyCourseId: number | string,
): Promise<CourseSummary | null> {
  const resp = await client.send(
    new GetItemCommand({
      TableName: coursesTable,
      Key: {
        tenantId: { S: tenantId },
        courseId: { S: String(legacyCourseId) },
      },
      ConsistentRead: true,
    }),
  );

  const name = resp.Item?.name?.S?.trim();
  const time = resp.Item?.time?.S?.trim();
  if (!name || !time) return null;

  const instructors =
    resp.Item?.instructors?.L?.map((entry) => entry.S?.trim() ?? "").filter(Boolean) ?? [];

  return {
    name,
    time,
    weekday: resp.Item?.weekday?.S,
    instructors,
  };
}
