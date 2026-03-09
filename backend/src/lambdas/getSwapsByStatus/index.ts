import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { Swap } from "@yogaswap/shared";

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId } = getTenantContext(event);
  console.log("getSwapsByStatus tenant context", { tenantId, userId });

  const status = event.queryStringParameters?.status;
  if (!status) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing status parameter' }) };
  }

  const command = new QueryCommand({
    TableName: process.env.SWAPS_TABLE,
    KeyConditionExpression: "tenantId = :tid",   // :tid = tenantId (PK)
    FilterExpression: "#s = :s",                  // :s = status
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":tid": { S: tenantId }, ":s": { S: status } },
    ConsistentRead: true,
  });

  try {
    console.log('getSwapsByStatus QueryCommand:', command.input);
    const data = await client.send(command);
    const items: Swap[] = (data.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId?.S ?? item.fromCourseId?.N ?? 0),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId?.S ?? item.toCourseId?.N ?? 0),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));
    console.log('getSwapsByStatus result:', items);
    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error('Error querying swaps by status:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};