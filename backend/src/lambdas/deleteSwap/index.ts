import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DeleteItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { canCancelSwap } from "@yogaswap/shared";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { getDelegationErrorResponse } from "../shared/delegation";

const client = dynamoClient;

async function loadCourseTime(
  tenantId: string,
  coursesTable: string,
  courseId: string,
): Promise<string | null> {
  const response = await client.send(
    new GetItemCommand({
      TableName: coursesTable,
      Key: { tenantId: { S: tenantId }, courseId: { S: courseId } },
      ConsistentRead: true,
    }),
  );
  if (!response.Item) return null;
  return response.Item.time?.S ?? "";
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "delete_swap",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;

  const swapId = event.pathParameters?.swapId;
  const user = event.queryStringParameters?.user;
  const swapsTable = process.env.SWAPS_TABLE;
  const coursesTable = process.env.COURSES_TABLE;

  console.log("DeleteSwap params:", { swapId, user });
  console.log("deleteSwap tenant context:", { tenantId, userId, actingForUserId });

  if (!swapId || !user) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing swapId or user parameter" }),
    };
  }
  if (!swapsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "SWAPS_TABLE env var is not set" }),
    };
  }

  const user_swapId = `${user}#${swapId}`;
  console.log("deleteSwap audit", {
    tenantId,
    actorUserId: userId ?? null,
    actingForUserId: actingForUserId ?? null,
    swapId,
    user,
  });

  try {
    const swapItem = await client.send(
      new GetItemCommand({
        TableName: swapsTable,
        Key: {
          tenantId: { S: tenantId },
          user_swapId: { S: user_swapId },
        },
        ConsistentRead: true,
      }),
    );

    if (!swapItem.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Swap not found" }),
      };
    }

    const fromDate = swapItem.Item.fromDate?.S;
    const toDate = swapItem.Item.toDate?.S;
    const fromCourseId = swapItem.Item.fromCourseId?.S;
    const toCourseId = swapItem.Item.toCourseId?.S;

    if (fromDate && toDate && fromCourseId && toCourseId && coursesTable) {
      const [fromTime, toTime] = await Promise.all([
        loadCourseTime(tenantId, coursesTable, fromCourseId),
        loadCourseTime(tenantId, coursesTable, toCourseId),
      ]);

      if (fromTime != null && toTime != null) {
        const swap = {
          fromCourseId: Number.parseInt(fromCourseId, 10),
          fromDate,
          toCourseId: Number.parseInt(toCourseId, 10),
          toDate,
        };
        const courses = [
          { id: swap.fromCourseId, time: fromTime },
          { id: swap.toCourseId, time: toTime },
        ];
        if (!canCancelSwap(swap, courses)) {
          return {
            statusCode: 403,
            body: JSON.stringify({
              error:
                "Dieser Tausch kann nicht mehr abgebrochen werden — Ursprung und Zieltermin liegen in der Vergangenheit.",
            }),
          };
        }
      }
    }

    const command = new DeleteItemCommand({
      TableName: swapsTable,
      Key: {
        tenantId: { S: tenantId },
        user_swapId: { S: user_swapId },
      },
    });

    console.log("DeleteSwap command:", command.input);
    await client.send(command);
    console.log("DeleteSwap success:", { swapId, user });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Swap deleted successfully" }),
    };
  } catch (err) {
    console.error("Error deleting swap:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
