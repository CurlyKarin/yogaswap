import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { CourseDateOverride } from "@yogaswap/shared";

const client = new DynamoDBClient({ region: "eu-central-1" });

const DEFAULT_TENANT_ID = "default-tenant";

type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  const userId =
    event.requestContext?.authorizer?.principalId ??
    event.queryStringParameters?.user ??
    null;

  const tenantId =
    event.headers?.['x-tenant-id'] ??
    event.headers?.['X-Tenant-ID'] ??
    DEFAULT_TENANT_ID;

  return {
    tenantId,
    userId: userId ?? undefined,
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId } = getTenantContext(event);
  console.log("getOverrides tenant context", { tenantId, userId });

  const courseIdParam = event.queryStringParameters?.courseId;
  const courseId = courseIdParam ? Number(courseIdParam) : undefined;
  const sinceDate = event.queryStringParameters?.sinceDate;

  // courseId-Filter über KeyCondition (begins_with courseId_date), nicht nachträglich
  const keyCondition = courseId !== undefined
    ? 'tenantId = :tid AND begins_with(courseId_date, :cid)'
    : 'tenantId = :tid';
  const exprValues: Record<string, any> = {
    ':tid': { S: tenantId },  // Platzhalter für Partition Key tenantId
  };
  if (courseId !== undefined) {
    exprValues[':cid'] = { S: `${courseId}_` };
  }

  const command = new QueryCommand({
    TableName: process.env.OVERRIDES_TABLE,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: exprValues,
    ConsistentRead: true,
  });

  try {
    const data = await client.send(command);
    let items: CourseDateOverride[] = (data.Items || []).map((item) => ({
      courseId: Number(item.courseId.S!),
      date: item.date.S!,
      participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
      swapped: item.swapped.L ? item.swapped.L.map((s: any) => s.S) : [],
      waitlist: item.waitlist.L ? item.waitlist.L.map((w: any) => w.S) : [],
    }));

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
