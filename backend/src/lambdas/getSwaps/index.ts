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
  console.log("getSwaps tenant context", { tenantId, userId });

  const user = event.queryStringParameters?.user;
  if (!user) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing user parameter" }),
    };
  }

  const fromDate = event.queryStringParameters?.fromDate;
  const fromCourseId = event.queryStringParameters?.fromCourseId;
  const toDate = event.queryStringParameters?.toDate;
  const toCourseId = event.queryStringParameters?.toCourseId;
  //const status = event.queryStringParameters?.status; // Kein Default-Wert

  const tenantId_user = `${tenantId}#${user}`;
  let command: QueryCommand;
  if (fromDate && fromCourseId) {
    // GSI_From: :tu = tenantId#user (PK), :f = Präfix fromDate_fromCourseId
    command = new QueryCommand({
      TableName: tableName,
      IndexName: "GSI_From",
      KeyConditionExpression: "tenantId_user = :tu AND begins_with(fromDate_fromCourseId_status, :f)",
      ExpressionAttributeValues: {
        ":tu": { S: tenantId_user },
        ":f": { S: `${fromDate}_${fromCourseId}` },
      },
      ConsistentRead: true,
    });
  } else if (toDate && toCourseId) {
    // GSI_To: :tu = tenantId#user (PK), :t = Präfix toDate_toCourseId
    command = new QueryCommand({
      TableName: tableName,
      IndexName: "GSI_To",
      KeyConditionExpression: "tenantId_user = :tu AND begins_with(toDate_toCourseId_status, :t)",
      ExpressionAttributeValues: {
        ":tu": { S: tenantId_user },
        ":t": { S: `${toDate}_${toCourseId}` },
      },
      ConsistentRead: true,
    });
  } else {
    // Haupttabelle: :tid = tenantId (PK), :uprefix = user# für alle Swaps des Users
    command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "tenantId = :tid AND begins_with(user_swapId, :uprefix)",
      ExpressionAttributeValues: {
        ":tid": { S: tenantId },
        ":uprefix": { S: `${user}#` },
      },
      ConsistentRead: true,
    });
  }

  try {
    console.log('QueryCommand:', command.input);
    const data = await client.send(command);
    const items: Swap[] = (data.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId?.S ?? item.fromCourseId?.N ?? 0),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId?.S ?? item.toCourseId?.N ?? 0),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));
    console.log('getSwaps result:', items);
    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error('Error querying swaps:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};