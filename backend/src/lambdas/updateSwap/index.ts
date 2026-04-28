import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { getDelegationErrorResponse } from "../shared/delegation";

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log("updateSwap tenant context", { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "update_swap",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;
  const swapId = event.pathParameters?.swapId;
  const user = event.queryStringParameters?.user;
  if (!swapId || !user) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing swapId or user" }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { status } = body;
  if (!status) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing status field" }),
    };
  }

  // Extrahiere fromDate, fromCourseId, toDate, toCourseId aus swapId
  const parts = swapId.split("_");
  if (parts.length !== 4) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid swapId format" }),
    };
  }
  const [fromDate, fromCourseId, toDate, toCourseId] = parts;

  const user_swapId = `${user}#${swapId}`;
  const command = new UpdateItemCommand({
    TableName: process.env.SWAPS_TABLE,
    Key: {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
    },
    UpdateExpression: "SET #status = :status, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":status": { S: status },
      ":fromStatus": { S: `${fromDate}_${fromCourseId}_${status}` },
      ":toStatus": { S: `${toDate}_${toCourseId}_${status}` },
    },
  });

  try {
    console.log("UpdateItemCommand:", command.input);
    await client.send(command);
    console.log("Swap updated:", { swapId, user, status });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Swap updated" }),
    };
  } catch (err) {
    console.error("Error updating swap:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};