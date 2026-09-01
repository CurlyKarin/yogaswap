import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getTenantContext } from "../shared/tenantContext";
import { resolveAppBaseUrlForTenant } from "../shared/appBaseUrl";
import { dynamoClient } from "../shared/dynamoClient";
import { getDelegationErrorResponse } from "../shared/delegation";
import { notifySwapSuccess } from "../shared/notifications/swapSuccessNotification";

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
    UpdateExpression:
      "SET #status = :status, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus, #actorUserId = :actorUserId, #actingForUserId = :actingForUserId",
    ExpressionAttributeNames: {
      "#status": "status",
      "#actorUserId": "actorUserId",
      "#actingForUserId": "actingForUserId",
    },
    ExpressionAttributeValues: {
      ":status": { S: status },
      ":fromStatus": { S: `${fromDate}_${fromCourseId}_${status}` },
      ":toStatus": { S: `${toDate}_${toCourseId}_${status}` },
      ":actorUserId": userId ? { S: userId } : { NULL: true },
      ":actingForUserId": actingForUserId ? { S: actingForUserId } : { NULL: true },
    },
  });

  try {
    console.log("UpdateItemCommand:", command.input);
    await client.send(command);
    console.log("Swap updated:", { swapId, user, status });

    if (status === "active") {
      try {
        const loginUrl = resolveAppBaseUrlForTenant(tenantId) || undefined;
        const mailSummary = await notifySwapSuccess({
          client,
          tenantId,
          swap: {
            participantId: user,
            toCourseId: Number(toCourseId),
            toDate,
          },
          coursesTable: process.env.COURSES_TABLE,
          participantsTable: process.env.PARTICIPANTS_TABLE,
          sesSourceEmail: process.env.SES_SOURCE_EMAIL,
          loginUrl,
          mailLocale: process.env.MAIL_LOCALE || "de",
          attachIcs: true,
        });
        console.info("updateSwap swap success mail summary", { tenantId, swapId, ...mailSummary });
      } catch (notificationError) {
        console.warn("updateSwap swap success notification failed", { tenantId, swapId, error: notificationError });
      }
    }

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