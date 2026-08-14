import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { queryCourseEnrollments } from "../shared/courseEnrollmentDynamo";

const client = dynamoClient;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.COURSE_ENROLLMENTS_TABLE;
  if (!tableName) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "COURSE_ENROLLMENTS_TABLE env var is not set" }),
    };
  }

  const { tenantId, userId } = getTenantContext(event);
  console.log("getCourseEnrollments tenant context", { tenantId, userId });

  const courseIdParam = event.queryStringParameters?.courseId;
  const courseId = courseIdParam ? Number(courseIdParam) : undefined;
  if (courseIdParam && !Number.isFinite(courseId)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "courseId must be a number" }),
    };
  }

  try {
    const items = await queryCourseEnrollments({
      client,
      tableName,
      tenantId,
      courseId,
    });
    return {
      statusCode: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(items),
    };
  } catch (err) {
    console.error("getCourseEnrollments failed", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
