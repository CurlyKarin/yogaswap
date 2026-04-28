import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { getDelegationErrorResponse } from "../shared/delegation";

const client = dynamoClient;

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
  console.log('DeleteSwap params:', { swapId, user });
  console.log('deleteSwap tenant context:', { tenantId, userId, actingForUserId });
  
  if (!swapId || !user) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing swapId or user parameter" }),
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
  const command = new DeleteItemCommand({
    TableName: process.env.SWAPS_TABLE,
    Key: {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
    },
  });

  try {
    console.log('DeleteSwap command:', command.input);
    await client.send(command);
    console.log('DeleteSwap success:', { swapId, user });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Swap deleted successfully" }),
    };
  } catch (err) {
    console.error('Error deleting swap:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};