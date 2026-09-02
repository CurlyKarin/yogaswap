import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { applySwapCutoffReconcileIfConfigured } from "../shared/applySwapCutoffReconcile";
import { resolveParticipantQueryRefs } from "../shared/participantResolver";
import { querySwapsForUserRefs } from "../shared/swapQueryHelpers";

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

  const user =
    event.queryStringParameters?.user ?? event.queryStringParameters?.participantId;
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

  const participantsTable = process.env.PARTICIPANTS_TABLE;

  try {
    const userRefs = await resolveParticipantQueryRefs(client, participantsTable, tenantId, user);
    const items = await querySwapsForUserRefs({
      client,
      swapsTable: tableName,
      tenantId,
      userRefs,
      fromDate,
      fromCourseId,
      toDate,
      toCourseId,
    });
    const reconciled = await applySwapCutoffReconcileIfConfigured({
      client,
      tenantId,
      swaps: items,
    });
    console.log('getSwaps result:', reconciled);
    return { statusCode: 200, body: JSON.stringify(reconciled) };
  } catch (err) {
    console.error('Error querying swaps:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};