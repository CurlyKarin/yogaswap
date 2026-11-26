import {
  DeleteItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  addUserUniqueCaseInsensitive,
  listIncludesAnyUserRef,
  removeUserCaseInsensitive,
  resolveEffectiveTermOccupancy,
  resolveStemForDate,
  withRegularCancellation,
  type Course,
  type CourseDateOverride,
  type CourseEnrollment,
  type Swap,
} from "@yogaswap/shared";
import { resolveParticipantRefAliases } from "./participantResolver";
import { notifyWaitlistPromotion } from "./notifications/waitlistPromotionNotification";
import { resolveAppBaseUrlForTenant } from "./appBaseUrl";

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

async function updateOverrideHelper(
  client: DynamoDBClient,
  tenantId: string,
  courseId: number,
  date: string,
  updates: {
    participants?: string[];
    cancelledParticipants?: string[];
    swapped?: string[];
    waitlist?: string[];
  },
): Promise<void> {
  const updateExpressionParts: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, { L: Array<{ S: string }> }> = {};

  if (updates.participants !== undefined) {
    updateExpressionParts.push("#participants = :participants");
    expressionAttributeNames["#participants"] = "participants";
    expressionAttributeValues[":participants"] = {
      L: updates.participants.map((p) => ({ S: p })),
    };
  }
  if (updates.cancelledParticipants !== undefined) {
    updateExpressionParts.push("#cancelledParticipants = :cancelledParticipants");
    expressionAttributeNames["#cancelledParticipants"] = "cancelledParticipants";
    expressionAttributeValues[":cancelledParticipants"] = {
      L: updates.cancelledParticipants.map((p) => ({ S: p })),
    };
  }
  if (updates.swapped !== undefined) {
    updateExpressionParts.push("#swapped = :swapped");
    expressionAttributeNames["#swapped"] = "swapped";
    expressionAttributeValues[":swapped"] = {
      L: updates.swapped.map((s) => ({ S: s })),
    };
  }
  if (updates.waitlist !== undefined) {
    updateExpressionParts.push("#waitlist = :waitlist");
    expressionAttributeNames["#waitlist"] = "waitlist";
    expressionAttributeValues[":waitlist"] = {
      L: updates.waitlist.map((w) => ({ S: w })),
    };
  }

  if (updateExpressionParts.length === 0) return;

  await client.send(
    new UpdateItemCommand({
      TableName: process.env.OVERRIDES_TABLE,
      Key: {
        tenantId: { S: tenantId },
        courseId_date: { S: `${courseId}_${date}` },
      },
      UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }),
  );
}

async function createOverrideHelper(
  client: DynamoDBClient,
  tenantId: string,
  override: CourseDateOverride,
): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: process.env.OVERRIDES_TABLE,
      Item: {
        tenantId: { S: tenantId },
        courseId_date: { S: `${override.courseId}_${override.date}` },
        courseId: { S: override.courseId.toString() },
        date: { S: override.date },
        participants: { L: (override.participants || []).map((p) => ({ S: p })) },
        ...(Array.isArray(override.cancelledParticipants)
          ? {
              cancelledParticipants: {
                L: override.cancelledParticipants.map((p) => ({ S: p })),
              },
            }
          : {}),
        swapped: { L: (override.swapped || []).map((s) => ({ S: s })) },
        waitlist: { L: (override.waitlist || []).map((w) => ({ S: w })) },
        shortNoticeCancellations: {
          L: (override.shortNoticeCancellations || []).map((w) => ({ S: w })),
        },
        ...(override.anonymousTrialCount && override.anonymousTrialCount > 0
          ? { anonymousTrialCount: { N: String(override.anonymousTrialCount) } }
          : {}),
      },
    }),
  );
}

/**
 * Aktiviert einen pending Waitlist-Swap analog zu processPromotions
 * (Ziel/Ursprung-Overrides, andere pending Swaps stornieren, Mail).
 */
export async function activatePendingWaitlistSwap(params: {
  client: DynamoDBClient;
  tenantId: string;
  actorUserId: string;
  correspondingSwap: Swap;
  targetOverride: CourseDateOverride;
  targetCourse: Course;
  allOverrides: CourseDateOverride[];
  courses: Course[];
  allEnrollments: CourseEnrollment[];
  pendingSwaps: Swap[];
}): Promise<void> {
  const {
    client,
    tenantId,
    actorUserId,
    correspondingSwap,
    targetOverride,
    targetCourse,
    allOverrides,
    courses,
    allEnrollments,
    pendingSwaps,
  } = params;

  const promotedSwapUser = correspondingSwap.participantId!;
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const promotedAliases = participantsTable
    ? await resolveParticipantRefAliases(client, participantsTable, tenantId, promotedSwapUser)
    : [promotedSwapUser];

  console.info("staffWaitlistPromote activate", {
    tenantId,
    actorUserId,
    promotedSwapUser,
    toCourseId: correspondingSwap.toCourseId,
    toDate: correspondingSwap.toDate,
    fromCourseId: correspondingSwap.fromCourseId,
    fromDate: correspondingSwap.fromDate,
  });

  const swapId = `${correspondingSwap.fromDate}_${correspondingSwap.fromCourseId}_${correspondingSwap.toDate}_${correspondingSwap.toCourseId}`;
  const user_swapId = `${promotedSwapUser}#${swapId}`;
  await client.send(
    new UpdateItemCommand({
      TableName: process.env.SWAPS_TABLE,
      Key: {
        tenantId: { S: tenantId },
        user_swapId: { S: user_swapId },
      },
      UpdateExpression:
        "SET #status = :status, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": { S: "active" },
        ":fromStatus": {
          S: `${correspondingSwap.fromDate}_${correspondingSwap.fromCourseId}_active`,
        },
        ":toStatus": {
          S: `${correspondingSwap.toDate}_${correspondingSwap.toCourseId}_active`,
        },
      },
    }),
  );

  const targetResolved = resolveEffectiveTermOccupancy(
    targetCourse,
    targetOverride,
    allEnrollments,
    targetOverride.date,
  );
  const newSwapped = addUserUniqueCaseInsensitive(
    Array.isArray(targetOverride.cancelledParticipants)
      ? (targetOverride.swapped ?? [])
      : targetResolved.swapped,
    promotedSwapUser,
  );
  const newWaitlist = removeUserCaseInsensitive(targetOverride.waitlist ?? [], promotedSwapUser);
  const newCancelled = Array.isArray(targetOverride.cancelledParticipants)
    ? (targetOverride.cancelledParticipants ?? [])
    : targetResolved.cancelledParticipants;
  await updateOverrideHelper(client, tenantId, targetOverride.courseId, targetOverride.date, {
    participants: [],
    cancelledParticipants: newCancelled,
    swapped: newSwapped,
    waitlist: newWaitlist,
  });

  const originOverride = allOverrides.find(
    (o) =>
      o.courseId === correspondingSwap.fromCourseId && o.date === correspondingSwap.fromDate,
  );
  const originCourse = courses.find((c) => c.id === correspondingSwap.fromCourseId);
  if (originOverride) {
    const originResolved = originCourse
      ? resolveEffectiveTermOccupancy(
          originCourse,
          originOverride,
          allEnrollments,
          originOverride.date,
        )
      : {
          cancelledParticipants: originOverride.cancelledParticipants ?? [],
          swapped: originOverride.swapped ?? [],
        };
    const stemParticipants = originCourse
      ? resolveStemForDate(originCourse, allEnrollments, correspondingSwap.fromDate)
      : [];
    const onStem =
      !!originCourse &&
      (listIncludesAnyUserRef(stemParticipants, promotedAliases) ||
        listIncludesAnyUserRef(originCourse.participants, promotedAliases));
    const newOriginCancelled = onStem
      ? withRegularCancellation(
          Array.isArray(originOverride.cancelledParticipants)
            ? originOverride.cancelledParticipants
            : originResolved.cancelledParticipants,
          promotedSwapUser,
        )
      : Array.isArray(originOverride.cancelledParticipants)
        ? (originOverride.cancelledParticipants ?? [])
        : originResolved.cancelledParticipants;
    const newOriginSwapped = removeUserCaseInsensitive(
      Array.isArray(originOverride.cancelledParticipants)
        ? (originOverride.swapped ?? [])
        : originResolved.swapped,
      promotedSwapUser,
    );
    const newOriginWaitlist = removeUserCaseInsensitive(
      originOverride.waitlist ?? [],
      promotedSwapUser,
    );
    await updateOverrideHelper(
      client,
      tenantId,
      correspondingSwap.fromCourseId,
      correspondingSwap.fromDate,
      {
        participants: [],
        cancelledParticipants: newOriginCancelled,
        swapped: newOriginSwapped,
        waitlist: newOriginWaitlist,
      },
    );
  } else if (
    originCourse &&
    (listIncludesAnyUserRef(
      resolveStemForDate(originCourse, allEnrollments, correspondingSwap.fromDate),
      promotedAliases,
    ) ||
      listIncludesAnyUserRef(originCourse.participants, promotedAliases))
  ) {
    await createOverrideHelper(client, tenantId, {
      courseId: correspondingSwap.fromCourseId,
      date: correspondingSwap.fromDate,
      participants: [],
      cancelledParticipants: [promotedSwapUser],
      swapped: [],
      waitlist: [],
    });
  }

  const pendingOriginSwaps = pendingSwaps.filter(
    (s) =>
      normalized(s.participantId) === normalized(promotedSwapUser) &&
      s.fromCourseId === correspondingSwap.fromCourseId &&
      s.fromDate === correspondingSwap.fromDate &&
      (s.toCourseId !== correspondingSwap.toCourseId || s.toDate !== correspondingSwap.toDate),
  );
  for (const originSwap of pendingOriginSwaps) {
    const originSwapId = `${originSwap.fromDate}_${originSwap.fromCourseId}_${originSwap.toDate}_${originSwap.toCourseId}`;
    const originUser_swapId = `${originSwap.participantId}#${originSwapId}`;
    await client.send(
      new DeleteItemCommand({
        TableName: process.env.SWAPS_TABLE,
        Key: {
          tenantId: { S: tenantId },
          user_swapId: { S: originUser_swapId },
        },
      }),
    );

    const targetOriginOverride = allOverrides.find(
      (o) => o.courseId === originSwap.toCourseId && o.date === originSwap.toDate,
    );
    if (targetOriginOverride) {
      const newTargetWaitlist = removeUserCaseInsensitive(
        targetOriginOverride.waitlist ?? [],
        promotedSwapUser,
      );
      await updateOverrideHelper(client, tenantId, originSwap.toCourseId, originSwap.toDate, {
        waitlist: newTargetWaitlist,
      });
    }
  }

  try {
    const loginUrl = resolveAppBaseUrlForTenant(tenantId) || undefined;
    await notifyWaitlistPromotion(client, {
      tenantId,
      swap: {
        participantId: promotedSwapUser,
        toCourseId: correspondingSwap.toCourseId,
        toDate: correspondingSwap.toDate,
      },
      coursesTable: process.env.COURSES_TABLE,
      participantsTable: process.env.PARTICIPANTS_TABLE,
      sesSourceEmail: process.env.SES_SOURCE_EMAIL,
      loginUrl,
    });
  } catch (notificationError) {
    console.warn("staffWaitlistPromote notification failed", {
      tenantId,
      user: promotedSwapUser,
      error: notificationError,
    });
  }
}
