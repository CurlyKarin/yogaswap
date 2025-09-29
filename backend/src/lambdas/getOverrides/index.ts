// backend/src/lambdas/getOverrides.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import type { CourseDateOverride } from "@yogaswap/shared";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Optionaler Filter nach courseId
  const courseIdParam = event.queryStringParameters?.courseId;
  const courseId = courseIdParam ? Number(courseIdParam) : undefined;
  const sinceDate = event.queryStringParameters?.sinceDate; // z. B. "2025-09-29"

  const command = new ScanCommand({
    TableName: process.env.OVERRIDES_TABLE,
  });

  try {
    const data = await client.send(command);
    let items: CourseDateOverride[] = (data.Items || []).map((item) => ({
      courseId: Number(item.courseId.S),
      date: item.date.S!,
      participants: JSON.parse(item.participants.S!),
      swapped: item.swapped ? JSON.parse(item.swapped.S!) : [],
      waitlist: item.waitlist ? JSON.parse(item.waitlist.S!) : [],
    }));

    if (courseId !== undefined) {
      items = items.filter((c) => c.courseId === courseId);
    }

    if (sinceDate) {
      items = items.filter((o) => new Date(o.date) >= new Date(sinceDate));
    }

    return {
      statusCode: 200,
      body: JSON.stringify(items),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
