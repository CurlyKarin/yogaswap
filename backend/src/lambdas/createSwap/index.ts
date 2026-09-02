import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  canCreateSwapFromOrigin,
  hasRegularBookingCapacity,
  isBoundedSeriesPlanningMode,
  isIsoWithinBoundedSeriesRights,
  isOnOrBeforeCourseRightsEnd,
  isSwapTargetInCutoffWindow,
  resolveEffectiveTermOccupancy,
  resolveGuestCount,
  resolveStemForDate,
  validateTermOccupancy,
} from '@yogaswap/shared';
import { getTenantContext } from '../shared/tenantContext';
import { resolveAppBaseUrlForTenant } from '../shared/appBaseUrl';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { fetchCourseUidByLegacyCourseId } from '../shared/courseUid';
import { loadTenantSettings } from '../shared/tenantSettingsLoader';
import { mapOverrideItem, mapStringList } from '../shared/overrideDynamo';
import { queryCourseEnrollments } from '../shared/courseEnrollmentDynamo';
import { notifySwapSuccess } from '../shared/notifications/swapSuccessNotification';
import { resolveOperationalNickname } from '../shared/participantResolver';

const client = dynamoClient;

function scheduleFromCourseItem(item: {
  planningMode?: { S?: string };
  seriesEndDate?: { S?: string };
  visibleUntil?: { S?: string };
  plannedEndDate?: { S?: string };
}) {
  return {
    planningMode: (item.planningMode?.S ?? "bounded_series") as
      | "bounded_series"
      | "rolling_continuous",
    seriesEndDate: item.seriesEndDate?.S,
    visibleUntil: item.visibleUntil?.S,
    plannedEndDate: item.plannedEndDate?.S,
    dates: [] as string[],
  };
}

function rejectBoundedSeriesSwap(
  schedule: ReturnType<typeof scheduleFromCourseItem>,
  dateIso: string,
): APIGatewayProxyResult | null {
  if (!isBoundedSeriesPlanningMode(schedule.planningMode)) return null;
  if (isOnOrBeforeCourseRightsEnd(schedule) && isIsoWithinBoundedSeriesRights(dateIso, schedule)) {
    return null;
  }
  return {
    statusCode: 400,
    body: JSON.stringify({
      error: "Für diesen Kursblock ist kein Tausch mehr möglich (Endedatum erreicht).",
    }),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log('createSwap tenant context', { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "create_swap",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;

  const tableName = process.env.SWAPS_TABLE;
  const coursesTable = process.env.COURSES_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  const enrollmentsTable = process.env.COURSE_ENROLLMENTS_TABLE;

  try {
    if (!tableName) {
      return { statusCode: 500, body: JSON.stringify({ error: 'SWAPS_TABLE env var is not set' }) };
    }
    if (!coursesTable) {
      return { statusCode: 500, body: JSON.stringify({ error: 'COURSES_TABLE env var is not set' }) };
    }
    const swap = event.body ? JSON.parse(event.body) : {};
    if (!swap.participantId || !swap.fromCourseId || !swap.fromDate || !swap.toCourseId || !swap.toDate || !swap.status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const participantsTable = process.env.PARTICIPANTS_TABLE;
    if (participantsTable) {
      swap.participantId = await resolveOperationalNickname(
        client,
        participantsTable,
        tenantId,
        swap.participantId,
      );
    }

    const fromLegacyId = swap.fromCourseId.toString();
    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: { tenantId: { S: tenantId }, courseId: { S: fromLegacyId } },
        ConsistentRead: true,
      }),
    );
    if (!courseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Origin course not found' }) };
    }
    const courseTime = courseResp.Item.time?.S ?? '';
    const originRightsError = rejectBoundedSeriesSwap(
      scheduleFromCourseItem(courseResp.Item),
      swap.fromDate,
    );
    if (originRightsError) return originRightsError;
    const baseParticipants = mapStringList(courseResp.Item.participants);
    const fromCourse = { id: Number(fromLegacyId), participants: baseParticipants };
    const tenantSettings = tenantsTable
      ? await loadTenantSettings(client, tenantsTable, tenantId)
      : undefined;

    const fromEnrollments = enrollmentsTable
      ? await queryCourseEnrollments({
          client,
          tableName: enrollmentsTable,
          tenantId,
          courseId: Number(fromLegacyId),
        })
      : [];

    let override;
    if (overridesTable) {
      const courseId_date = `${fromLegacyId}_${swap.fromDate}`;
      const overrideResp = await client.send(
        new GetItemCommand({
          TableName: overridesTable,
          Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
          ConsistentRead: true,
        }),
      );
      if (overrideResp.Item) {
        override = mapOverrideItem(overrideResp.Item);
      }
    }
    const originEffective = resolveEffectiveTermOccupancy(
      fromCourse,
      override,
      fromEnrollments,
      swap.fromDate,
    );
    const participants = originEffective.participants;
    const stemOnOrigin = resolveStemForDate(fromCourse, fromEnrollments, swap.fromDate);
    const originallyParticipant = stemOnOrigin.some(
      (p) => p.toLowerCase() === swap.participantId.toLowerCase(),
    );
    if (
      !canCreateSwapFromOrigin({
        isoDate: swap.fromDate,
        courseTime,
        tenantSettings,
        override,
        userName: swap.participantId,
        participants,
        originallyParticipant,
      })
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'In diesem Zeitfenster ist kein Tausch vom Ursprungstermin mehr möglich.',
        }),
      };
    }

    const toLegacyId = swap.toCourseId.toString();
    const toCourseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: { tenantId: { S: tenantId }, courseId: { S: toLegacyId } },
        ConsistentRead: true,
      }),
    );
    if (!toCourseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Target course not found' }) };
    }
    const targetRightsError = rejectBoundedSeriesSwap(
      scheduleFromCourseItem(toCourseResp.Item),
      swap.toDate,
    );
    if (targetRightsError) return targetRightsError;
    const targetCourseTime = toCourseResp.Item.time?.S ?? '';
    if (isSwapTargetInCutoffWindow(swap.toDate, targetCourseTime, tenantSettings)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Für diesen Zieltermin ist keine Tauschanfrage mehr möglich (kurz vor Kursbeginn).',
        }),
      };
    }
    const toCapacity = {
      capacity: toCourseResp.Item.capacity?.N ? Number.parseInt(toCourseResp.Item.capacity.N, 10) : 0,
      overbookLimit: toCourseResp.Item.overbookLimit?.N
        ? Number.parseInt(toCourseResp.Item.overbookLimit.N, 10)
        : 0,
    };
    const toBaseParticipants = mapStringList(toCourseResp.Item.participants);
    const toCourse = { id: Number(toLegacyId), participants: toBaseParticipants };
    const toEnrollments = enrollmentsTable
      ? await queryCourseEnrollments({
          client,
          tableName: enrollmentsTable,
          tenantId,
          courseId: Number(toLegacyId),
        })
      : [];
    let targetOverride;
    let targetGuestCount = 0;
    if (overridesTable) {
      const targetOverrideKey = `${toLegacyId}_${swap.toDate}`;
      const targetOverrideResp = await client.send(
        new GetItemCommand({
          TableName: overridesTable,
          Key: { tenantId: { S: tenantId }, courseId_date: { S: targetOverrideKey } },
          ConsistentRead: true,
        }),
      );
      if (targetOverrideResp.Item) {
        targetOverride = mapOverrideItem(targetOverrideResp.Item);
        targetGuestCount = resolveGuestCount(targetOverride.anonymousTrialCount);
      }
    }
    const targetParticipants = resolveEffectiveTermOccupancy(
      toCourse,
      targetOverride,
      toEnrollments,
      swap.toDate,
    ).participants;
    const swapUserLower = swap.participantId.toLowerCase();
    const userOnTarget = targetParticipants.some((p) => p.toLowerCase() === swapUserLower);
    const countAfterSwap = userOnTarget
      ? targetParticipants.length
      : targetParticipants.length + 1;
    if (swap.status === 'active') {
      if (!userOnTarget && !hasRegularBookingCapacity(targetParticipants.length, toCapacity, targetGuestCount)) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Der Zieltermin ist regulär voll. Überplanungsplätze sind per Tausch nicht buchbar.',
          }),
        };
      }
      const targetCapacityError = validateTermOccupancy(countAfterSwap, toCapacity, targetGuestCount);
      if (targetCapacityError) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Der Zieltermin ist voll (maximale Raumkapazität erreicht).' }),
        };
      }
    }

    const [fromCourseUid, toCourseUid] = await Promise.all([
      fetchCourseUidByLegacyCourseId(client, coursesTable, tenantId, fromLegacyId),
      fetchCourseUidByLegacyCourseId(client, coursesTable, tenantId, toLegacyId),
    ]);

    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    const user_swapId = `${swap.participantId}#${swapId}`;
    const tenantId_user = `${tenantId}#${swap.participantId}`;
    const dynamoItem = {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
      user: { S: swap.participantId },
      participantId: { S: swap.participantId },
      swapId: { S: swapId },
      fromCourseId: { S: fromLegacyId },
      fromDate: { S: swap.fromDate },
      toCourseId: { S: toLegacyId },
      toDate: { S: swap.toDate },
      status: { S: swap.status },
      fromDate_fromCourseId_status: { S: `${swap.fromDate}_${swap.fromCourseId}_${swap.status}` },
      toDate_toCourseId_status: { S: `${swap.toDate}_${swap.toCourseId}_${swap.status}` },
      tenantId_user: { S: tenantId_user },
      actorUserId: userId ? { S: userId } : { NULL: true },
      actingForUserId: actingForUserId ? { S: actingForUserId } : { NULL: true },
      ...(fromCourseUid ? { fromCourseUid: { S: fromCourseUid } } : {}),
      ...(toCourseUid ? { toCourseUid: { S: toCourseUid } } : {}),
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));

    if (swap.status === "active") {
      try {
        const loginUrl = resolveAppBaseUrlForTenant(tenantId) || undefined;
        const mailSummary = await notifySwapSuccess({
          client,
          tenantId,
          swap: {
            participantId: swap.participantId,
            toCourseId: Number(swap.toCourseId),
            toDate: swap.toDate,
          },
          coursesTable,
          participantsTable: process.env.PARTICIPANTS_TABLE,
          sesSourceEmail: process.env.SES_SOURCE_EMAIL,
          loginUrl,
          mailLocale: process.env.MAIL_LOCALE || "de",
          attachIcs: true,
        });
        console.info("createSwap swap success mail summary", { tenantId, swapId, ...mailSummary });
      } catch (notificationError) {
        console.warn("createSwap swap success notification failed", { tenantId, swapId, error: notificationError });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Swap created' }) };
  } catch (error) {
    console.error('Error creating swap:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create swap' }) };
  }
};
