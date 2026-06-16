import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import type { Swap } from "@yogaswap/shared";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import {
  buildRingSwapGraph,
  findRingCycles,
  selectDisjointCycles,
} from "../shared/ringSwapGraph";

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { tenantId, userId } = getTenantContext(event);
    console.log("processRingSwaps tenant context", { tenantId, userId });

    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
    }

    const pendingSwapsCommand = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      KeyConditionExpression: "tenantId = :tid",
      FilterExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":tid": { S: tenantId }, ":s": { S: "pending" } },
      ConsistentRead: true,
    });
    const pendingSwapsData = await client.send(pendingSwapsCommand);
    const pendingSwaps: Swap[] = (pendingSwapsData.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId.N || item.fromCourseId.S),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId.N || item.toCourseId.S),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));

    const graph = buildRingSwapGraph(pendingSwaps);
    const cycles = findRingCycles(graph);
    const selectedCycles = selectDisjointCycles(cycles);
    const edgesCount = [...graph.adjacency.values()].reduce((sum, edges) => sum + edges.length, 0);

    const diagnostics = {
      pendingSwaps: pendingSwaps.length,
      graphNodes: graph.nodes.length,
      graphEdges: edgesCount,
      detectedCycles: cycles.length,
      selectedCycles: selectedCycles.length,
      droppedSwaps: graph.droppedSwaps.length,
    };
    console.log("[processRingSwaps] diagnostics", diagnostics);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Ring swap analysis complete",
        diagnostics,
      }),
    };
  } catch (error) {
    console.error("Error in processRingSwaps:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to process ring swaps" }) };
  }
};

