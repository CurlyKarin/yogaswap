import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { resolveAppBaseUrlForTenant } from '../shared/appBaseUrl';
import { dynamoClient } from '../shared/dynamoClient';
import { getDelegationErrorResponse } from '../shared/delegation';
import { resolveLegacyCourseIdFromPathSegment } from '../shared/courseUid';
import { loadTenantSettings } from '../shared/tenantSettingsLoader';
import {
  mergeOverrideUpdate,
  validateSelfServiceOverrideTransition,
  validateShortNoticeParticipantsInvariant,
  type OverrideUpdateBody,
} from '../shared/cutoffOverrideValidation';
import { mapOverrideItem, mapStringList, stringListAttribute, anonymousTrialCountAttribute } from '../shared/overrideDynamo';
import { courseCapacityFromDynamoItem, validateParticipantsForCourse } from '../shared/courseCapacityDynamo';
import { validateAnonymousTrialCount } from '@yogaswap/shared';
import { resolveSelfServiceAbsenceKind } from '../shared/notifications/resolveSelfServiceAbsenceKind';
import { notifyParticipantTermReleased } from '../shared/notifications/termAbsenceNotifications';

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId, actingForUserId } = getTenantContext(event);
  console.log('updateOverride tenant context', { tenantId, userId, actingForUserId });
  const delegationErrorResponse = getDelegationErrorResponse({
    action: "update_override",
    actorUserId: userId,
    actingForUserId,
  });
  if (delegationErrorResponse) return delegationErrorResponse;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const coursesTable = process.env.COURSES_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  const rawCourseId = event.pathParameters?.courseId?.trim();
  const date = event.pathParameters?.date?.trim();

  try {
    if (!overridesTable || !coursesTable) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OVERRIDES_TABLE or COURSES_TABLE env var is not set' }),
      };
    }
    if (!rawCourseId || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    const resolvedPath = await resolveLegacyCourseIdFromPathSegment(
      client,
      coursesTable,
      tenantId,
      rawCourseId,
    );
    if (!resolvedPath.ok) {
      return { statusCode: resolvedPath.statusCode, body: resolvedPath.body };
    }
    const legacyCourseId = resolvedPath.legacyCourseId;

    const updates = JSON.parse(event.body || '{}') as OverrideUpdateBody;

    const hasUpdatableField =
      updates.participants !== undefined ||
      updates.swapped !== undefined ||
      updates.waitlist !== undefined ||
      updates.shortNoticeCancellations !== undefined ||
      updates.anonymousTrialCount !== undefined;
    if (!hasUpdatableField) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No fields to update' }) };
    }

    if (updates.participants) {
      if (!Array.isArray(updates.participants) || updates.participants.some((p: unknown) => typeof p !== 'string')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid participants array' }) };
      }
    }
    if (updates.swapped) {
      if (!Array.isArray(updates.swapped) || updates.swapped.some((s: unknown) => typeof s !== 'string')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid swapped array' }) };
      }
    }
    if (updates.waitlist) {
      if (!Array.isArray(updates.waitlist) || updates.waitlist.some((w: unknown) => typeof w !== 'string')) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid waitlist array' }) };
      }
    }
    if (updates.shortNoticeCancellations) {
      if (
        !Array.isArray(updates.shortNoticeCancellations) ||
        updates.shortNoticeCancellations.some((w: unknown) => typeof w !== 'string')
      ) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid shortNoticeCancellations array' }) };
      }
    }
    if (updates.anonymousTrialCount !== undefined) {
      const guestCountError = validateAnonymousTrialCount(updates.anonymousTrialCount);
      if (guestCountError) {
        return { statusCode: 400, body: JSON.stringify({ error: guestCountError }) };
      }
    }

    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: { tenantId: { S: tenantId }, courseId: { S: legacyCourseId } },
        ConsistentRead: true,
      }),
    );
    if (!courseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Course not found' }) };
    }
    const courseTime = courseResp.Item.time?.S ?? '';
    const courseName = courseResp.Item.name?.S ?? `Kurs ${legacyCourseId}`;
    const baseParticipants = mapStringList(courseResp.Item.participants);
    const capacityFields = courseCapacityFromDynamoItem(courseResp.Item);

    const courseId_date = `${legacyCourseId}_${date}`;
    const existingResp = await client.send(
      new GetItemCommand({
        TableName: overridesTable,
        Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
        ConsistentRead: true,
      }),
    );
    const before = existingResp.Item ? mapOverrideItem(existingResp.Item) : null;
    if (before) {
      before.courseId = Number(legacyCourseId);
      before.date = date;
    }

    const touchesCutoffFields =
      updates.participants !== undefined || updates.shortNoticeCancellations !== undefined;

    const subjectNickname = actingForUserId ?? userId;
    let selfServiceAbsenceKind: ReturnType<typeof resolveSelfServiceAbsenceKind> = null;
    if (touchesCutoffFields && subjectNickname && tenantsTable) {
      const tenantSettings = await loadTenantSettings(client, tenantsTable, tenantId);
      const merged = mergeOverrideUpdate(before, baseParticipants, updates);
      merged.courseId = Number(legacyCourseId);
      merged.date = date;

      const invariantError = validateShortNoticeParticipantsInvariant(merged);
      if (invariantError) {
        return { statusCode: 400, body: JSON.stringify({ error: invariantError }) };
      }

      const transitionError = validateSelfServiceOverrideTransition({
        actorNickname: subjectNickname,
        courseTime,
        dateIso: date,
        tenantSettings,
        before,
        after: merged,
        baseParticipants,
      });
      if (transitionError) {
        return { statusCode: 400, body: JSON.stringify({ error: transitionError }) };
      }

      selfServiceAbsenceKind = resolveSelfServiceAbsenceKind({
        actorNickname: subjectNickname,
        courseTime,
        dateIso: date,
        tenantSettings,
        before,
        after: merged,
        baseParticipants,
      });
    }

    if (updates.participants !== undefined || updates.anonymousTrialCount !== undefined) {
      const merged = mergeOverrideUpdate(before, baseParticipants, updates);
      const capacityError = validateParticipantsForCourse(
        merged.participants,
        capacityFields,
        merged.anonymousTrialCount ?? 0,
      );
      if (capacityError) {
        return { statusCode: 400, body: JSON.stringify({ error: capacityError }) };
      }
    }

    let updateExpression = 'SET';
    const expressionAttributeValues: Record<string, any> = {};
    const expressionAttributeNames: Record<string, string> = {};

    if (updates.participants) {
      updateExpression += ' #participants = :participants,';
      expressionAttributeNames['#participants'] = 'participants';
      expressionAttributeValues[':participants'] = stringListAttribute(updates.participants);
    }

    if (updates.swapped) {
      updateExpression += ' #swapped = :swapped,';
      expressionAttributeNames['#swapped'] = 'swapped';
      expressionAttributeValues[':swapped'] = stringListAttribute(updates.swapped);
    }

    if (updates.waitlist) {
      updateExpression += ' #waitlist = :waitlist,';
      expressionAttributeNames['#waitlist'] = 'waitlist';
      expressionAttributeValues[':waitlist'] = stringListAttribute(updates.waitlist);
    }

    if (updates.shortNoticeCancellations) {
      updateExpression += ' #shortNotice = :shortNotice,';
      expressionAttributeNames['#shortNotice'] = 'shortNoticeCancellations';
      expressionAttributeValues[':shortNotice'] = stringListAttribute(updates.shortNoticeCancellations);
    }

    if (updates.anonymousTrialCount !== undefined) {
      updateExpression += ' #anonymousTrialCount = :anonymousTrialCount,';
      expressionAttributeNames['#anonymousTrialCount'] = 'anonymousTrialCount';
      expressionAttributeValues[':anonymousTrialCount'] =
        updates.anonymousTrialCount > 0
          ? anonymousTrialCountAttribute(updates.anonymousTrialCount)
          : { N: '0' };
    }

    updateExpression += ' #actorUserId = :actorUserId, #actingForUserId = :actingForUserId,';
    expressionAttributeNames['#actorUserId'] = 'actorUserId';
    expressionAttributeNames['#actingForUserId'] = 'actingForUserId';
    expressionAttributeValues[':actorUserId'] = userId ? { S: userId } : { NULL: true };
    expressionAttributeValues[':actingForUserId'] = actingForUserId ? { S: actingForUserId } : { NULL: true };

    updateExpression = updateExpression.slice(0, -1);

    await client.send(
      new UpdateItemCommand({
        TableName: overridesTable,
        Key: { tenantId: { S: tenantId }, courseId_date: { S: courseId_date } },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    if (selfServiceAbsenceKind === "term_released" && subjectNickname) {
      try {
        const baseUrl = resolveAppBaseUrlForTenant(tenantId);
        const mailSummary = await notifyParticipantTermReleased(client, {
          tenantId,
          userId: subjectNickname,
          courseName,
          dateIso: date,
          time: courseTime,
          participantsTable: process.env.PARTICIPANTS_TABLE,
          sesSourceEmail: process.env.SES_SOURCE_EMAIL,
          baseUrl,
        });
        console.info("updateOverride term released mail summary", {
          tenantId,
          courseId: legacyCourseId,
          date,
          userId: subjectNickname,
          ...mailSummary,
        });
      } catch (notificationError) {
        console.warn("updateOverride term released notification failed", {
          tenantId,
          courseId: legacyCourseId,
          date,
          error: notificationError,
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Override updated' }) };
  } catch (error) {
    console.error('Error updating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update override' }) };
  }
};
