import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { Swap } from "@yogaswap/shared";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";

const client = dynamoClient;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.SWAPS_TABLE;

  if (!tableName) {
    console.error("SWAPS_TABLE env var is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "SWAPS_TABLE env var is not set" }),
    };
  }

  const { tenantId, userId } = getTenantContext(event);
  console.log("getSwapsByStatus tenant context", { tenantId, userId });

  const status = event.queryStringParameters?.status;
  if (!status) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing status parameter" }),
    };
  }

  const command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "tenantId = :tid", // :tid = tenantId (PK)
    FilterExpression: "#s = :s", // :s = status
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