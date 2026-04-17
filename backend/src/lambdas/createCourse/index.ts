import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;
const COURSE_STATUSES = new Set(["inactive", "draft", "active"]);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

type CreateCourseBody = {
  name?: string;
  weekday?: string;
  time?: string;
  capacity?: number;
  status?: string;
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  if (!coursesTable || !membershipsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "COURSES_TABLE or MEMBERSHIPS_TABLE env var is not set" }),
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

    await client.send(
      new PutItemCommand({
        TableName: coursesTable,
        Item: {
          tenantId: { S: tenantId },
          courseId: { S: nextCourseId },
          id: { N: String(nextId) },
          name: { S: name },
          weekday: { S: weekday },
          time: { S: time },
          capacity: { N: String(capacity) },
          status: { S: status },
          participants: { L: [] },
          dates: { L: [] },
        },
        ConditionExpression: "attribute_not_exists(courseId)",
      }),
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        id: nextId,
        courseId: nextCourseId,
        name,
        weekday,
        time,
        capacity,
        status,
        participants: [],
        dates: [],
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
