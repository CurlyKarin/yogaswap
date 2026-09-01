import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import type { Course, CourseDateOverride, Swap } from "@yogaswap/shared";
import { getTenantContext } from "../shared/tenantContext";
import { resolveAppBaseUrlForTenant } from "../shared/appBaseUrl";
import { dynamoClient } from "../shared/dynamoClient";
import { mapOverrideItem } from "../shared/overrideDynamo";
import { loadTenantSettings } from "../shared/tenantSettingsLoader";
import {
  buildRingSwapGraph,
  findRingCycles,
  selectDisjointCycles,
} from "../shared/ringSwapGraph";
import { planRingCycleExecution } from "../shared/ringSwapExecution";
import { executeRingCyclePlan, isTransactionConflict } from "../shared/ringSwapExecutionDynamo";
import {
  buildExecutedRingLog,
  buildRejectedRingLog,
  logCycleRejected,
  logCycleTransactionConflict,
  logRingSwapRun,
  type ExecutedRingLog,
  type RejectedRingLog,
} from "../shared/ringSwapLogging";
import { notifySwapSuccess } from "../shared/notifications/swapSuccessNotification";
import { dynamoItemToSwap } from "../shared/swapDynamo";

const client = dynamoClient;

function cycleParticipantIds(cycle: { edges: Array<{ swap: Swap }> }): string[] {
  return cycle.edges.flatMap((edge) => {
    const participantId = edge.swap.participantId?.trim();
    return participantId ? [participantId] : [];
  });
}

function mapSwapItem(item: Record<string, any>): Swap {
  const mapped = dynamoItemToSwap(item);
  if (!mapped) {
    throw new Error("Invalid swap item");
  }
  return mapped;
}

function mapCourseItem(item: Record<string, any>): Course {
  return {
    id: Number(item.id?.N ?? item.courseId?.S ?? 0),
    name: item.name.S!,
    weekday: item.weekday.S!,
    time: item.time.S!,
    capacity: Number(item.capacity.N!),
    overbookLimit: item.overbookLimit?.N ? Number(item.overbookLimit.N) : 0,
    participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
    dates: item.dates.L ? item.dates.L.map((d: any) => d.S) : [],
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { tenantId, userId } = getTenantContext(event);

    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
    }

    const swapsTable = process.env.SWAPS_TABLE;
    const overridesTable = process.env.OVERRIDES_TABLE;
    const coursesTable = process.env.COURSES_TABLE;
    if (!swapsTable || !overridesTable || !coursesTable) {
      return { statusCode: 500, body: JSON.stringify({ error: "Required table env vars are not set" }) };
    }

    const [pendingSwapsData, coursesData, overridesData] = await Promise.all([
      client.send(
        new QueryCommand({
          TableName: swapsTable,
          KeyConditionExpression: "tenantId = :tid",
          FilterExpression: "#s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":tid": { S: tenantId }, ":s": { S: "pending" } },
          ConsistentRead: true,
        }),
      ),
      client.send(
        new QueryCommand({
          TableName: coursesTable,
          KeyConditionExpression: "tenantId = :tid",
          ExpressionAttributeValues: { ":tid": { S: tenantId } },
          ConsistentRead: true,
        }),
      ),
      client.send(
        new QueryCommand({
          TableName: overridesTable,
          KeyConditionExpression: "tenantId = :tid",
          ExpressionAttributeValues: { ":tid": { S: tenantId } },
          ConsistentRead: true,
        }),
      ),
    ]);

    const pendingSwaps: Swap[] = (pendingSwapsData.Items || []).map(mapSwapItem);
    const courses: Course[] = (coursesData.Items || []).map(mapCourseItem);
    const overrides: CourseDateOverride[] = (overridesData.Items || []).map((item) =>
      mapOverrideItem(item),
    );

    const tenantsTable = process.env.TENANTS_TABLE;
    const tenantSettings = tenantsTable
      ? await loadTenantSettings(client, tenantsTable, tenantId)
      : undefined;

    const graph = buildRingSwapGraph(pendingSwaps);
    const cycles = findRingCycles(graph);
    const selectedCycles = selectDisjointCycles(cycles);
    const edgesCount = [...graph.adjacency.values()].reduce((sum, edges) => sum + edges.length, 0);

    const executionContext = {
      courses,
      overrides,
      pendingSwaps,
      tenantSettings,
    };

    const rejectedCycles: Array<{ reason: string; users: string[] }> = [];
    const executedRings: ExecutedRingLog[] = [];
    const rejectedRings: RejectedRingLog[] = [];
    let executedCycles = 0;

    const swapKey = (swap: Swap) =>
      `${swap.participantId}|${swap.fromCourseId}|${swap.fromDate}|${swap.toCourseId}|${swap.toDate}`;

    for (const cycle of selectedCycles) {
      const planned = planRingCycleExecution(cycle, executionContext);
      if (!planned.ok) {
        const users = cycleParticipantIds(cycle);
        rejectedCycles.push({
          reason: planned.reason,
          users,
        });
        logCycleRejected(users, planned.reason);
        rejectedRings.push(buildRejectedRingLog(cycle, planned.reason));
        continue;
      }

      try {
        await executeRingCyclePlan({
          client,
          tenantId,
          plan: planned.plan,
          swapsTable,
          overridesTable,
        });
        executedCycles++;

        for (const write of planned.plan.overrideWrites) {
          const idx = executionContext.overrides.findIndex(
            (override) =>
              override.courseId === write.override.courseId && override.date === write.override.date,
          );
          if (idx >= 0) {
            executionContext.overrides[idx] = write.override;
          } else {
            executionContext.overrides.push(write.override);
          }
        }

        const consumedSwapKeys = new Set(
          [...planned.plan.swapActivations, ...planned.plan.swapDeletions].map(swapKey),
        );
        executionContext.pendingSwaps = executionContext.pendingSwaps.filter(
          (swap) => !consumedSwapKeys.has(swapKey(swap)),
        );

        executedRings.push(buildExecutedRingLog(cycle, planned.plan, courses));

        try {
          const loginUrl = resolveAppBaseUrlForTenant(tenantId) || undefined;
          for (const activatedSwap of planned.plan.swapActivations) {
            const mailSummary = await notifySwapSuccess({
              client,
              tenantId,
              swap: activatedSwap,
              coursesTable,
              participantsTable: process.env.PARTICIPANTS_TABLE,
              sesSourceEmail: process.env.SES_SOURCE_EMAIL,
              loginUrl,
              mailLocale: process.env.MAIL_LOCALE || "de",
              attachIcs: true,
            });
            console.info("processRingSwaps swap success mail summary", {
              tenantId,
              user: activatedSwap.participantId,
              ...mailSummary,
            });
          }
        } catch (notificationError) {
          console.warn("processRingSwaps swap success notification failed", {
            tenantId,
            error: notificationError,
          });
        }
      } catch (error) {
        if (isTransactionConflict(error)) {
          const users = cycleParticipantIds(cycle);
          const reason = "Transaction conflict (likely concurrent or stale state)";
          rejectedCycles.push({ reason, users });
          logCycleTransactionConflict(users);
          rejectedRings.push(buildRejectedRingLog(cycle, reason));
          continue;
        }
        throw error;
      }
    }

    const diagnostics = {
      pendingSwaps: pendingSwaps.length,
      graphNodes: graph.nodes.length,
      graphEdges: edgesCount,
      detectedCycles: cycles.length,
      selectedCycles: selectedCycles.length,
      executedCycles,
      rejectedCycles: rejectedCycles.length,
      droppedSwaps: graph.droppedSwaps.length,
    };
    logRingSwapRun({
      tenantId,
      userId,
      diagnostics,
      executedRings: executedRings.length > 0 ? executedRings : undefined,
      rejectedRings: rejectedRings.length > 0 ? rejectedRings : undefined,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: executedCycles > 0 ? "Ring swaps executed" : "Ring swap analysis complete",
        diagnostics,
        rejectedCycles,
      }),
    };
  } catch (error) {
    console.error("Error in processRingSwaps:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to process ring swaps" }) };
  }
};
