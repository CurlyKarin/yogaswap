import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import type { Swap } from "@yogaswap/shared";

/** Map Dynamo swap item to API model (#317: participantId, legacy `user` attribute). */
export function dynamoItemToSwap(item: Record<string, AttributeValue>): Swap | null {
  const participantId = item.participantId?.S ?? item.user?.S;
  const fromDate = item.fromDate?.S;
  const toDate = item.toDate?.S;
  const status = item.status?.S as Swap["status"] | undefined;
  if (!participantId || !fromDate || !toDate || !status) return null;

  return {
    participantId,
    fromCourseId: Number(item.fromCourseId?.S ?? item.fromCourseId?.N ?? 0),
    ...(item.fromCourseUid?.S ? { fromCourseUid: item.fromCourseUid.S } : {}),
    fromDate,
    toCourseId: Number(item.toCourseId?.S ?? item.toCourseId?.N ?? 0),
    ...(item.toCourseUid?.S ? { toCourseUid: item.toCourseUid.S } : {}),
    toDate,
    status,
    ...(item.tenantId?.S ? { tenantId: item.tenantId.S } : {}),
  };
}

export function swapToDynamoAttributes(swap: Swap): Record<string, AttributeValue> {
  const participantId = swap.participantId?.trim();
  if (!participantId) {
    throw new Error("swap.participantId is required");
  }
  return {
    participantId: { S: participantId },
    user: { S: participantId },
    fromCourseId: { S: String(swap.fromCourseId) },
    fromDate: { S: swap.fromDate },
    toCourseId: { S: String(swap.toCourseId) },
    toDate: { S: swap.toDate },
    status: { S: swap.status },
    ...(swap.fromCourseUid ? { fromCourseUid: { S: swap.fromCourseUid } } : {}),
    ...(swap.toCourseUid ? { toCourseUid: { S: swap.toCourseUid } } : {}),
    ...(swap.tenantId ? { tenantId: { S: swap.tenantId } } : {}),
  };
}
