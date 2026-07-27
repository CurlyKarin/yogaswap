import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { dynamoClient } from "../shared/dynamoClient";
import { notifyStudioTermCancelled } from "../shared/notifications/termAbsenceNotifications";
import { resolveLegacyCourseIdFromPathSegment } from "../shared/courseUid";
import { getTenantContext } from "../shared/tenantContext";
import { resolveAppBaseUrlForTenant } from "../shared/appBaseUrl";
import { formatSesFromAddress } from "../shared/notifications/sesFromAddress";

const client = dynamoClient;
const ses = new SESClient({});
type CancelBody = {
  rollbackSuccessfulSwapsFromCancelledParticipants?: boolean;
  rollbackPendingWaitlistSwapsFromOriginDate?: boolean;
  rollbackOutgoingSwapsFromCancelledParticipants?: boolean;
  notifyAlreadyCancelledParticipants?: boolean;
};
type CancelCourseDateWarningCode =
  | "waitlist_cleanup_failed"
  | "participant_lookup_failed"
  | "participant_mail_failed"
  | "studio_report_failed";

function parseBody(event: APIGatewayProxyEvent): CancelBody {
  if (!event.body) return {};
  try {
    const parsed = JSON.parse(event.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as CancelBody;
  } catch {
    return {};
  }
}

function asStringList(value: { L?: Array<{ S?: string }> } | undefined): string[] {
  return (value?.L ?? []).map((entry) => entry.S ?? "").filter(Boolean);
}

function dedupeUsers(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function parseCsvEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isIsoDateInFuture(isoDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return isoDate > today;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const swapsTable = process.env.SWAPS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const sesSourceEmail = formatSesFromAddress(process.env.SES_SOURCE_EMAIL || "");
  const studioNotificationEmails = parseCsvEmails(process.env.STUDIO_NOTIFICATION_EMAILS);
  if (!coursesTable || !overridesTable || !swapsTable || !membershipsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Required env vars are missing for cancelCourseDate" }),
    };
  }

  const rawCourseId = event.pathParameters?.courseId?.trim();
  const date = event.pathParameters?.date?.trim();
  if (!rawCourseId || !date) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing courseId or date in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const body = parseBody(event);
  const rollbackSuccessfulSwaps =
    body.rollbackSuccessfulSwapsFromCancelledParticipants ??
    (body.rollbackOutgoingSwapsFromCancelledParticipants === true);
  const rollbackPendingWaitlistSwaps =
    body.rollbackPendingWaitlistSwapsFromOriginDate ??
    body.rollbackOutgoingSwapsFromCancelledParticipants ??
    true;

  try {
    const resolvedPath = await resolveLegacyCourseIdFromPathSegment(
      client,
      coursesTable,
      tenantId,
      rawCourseId,
    );
    if (!resolvedPath.ok) {
      return { statusCode: resolvedPath.statusCode, body: resolvedPath.body };
    }
    const courseId = resolvedPath.legacyCourseId;

    console.info("cancelCourseDate start", {
      tenantId,
      actorUserId,
      courseId,
      date,
      rollbackSuccessfulSwaps,
      rollbackPendingWaitlistSwaps,
    });

    const actorMembershipResp = await client.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: actorUserId },
        },
        ConsistentRead: true,
      }),
    );
    const actorRole = actorMembershipResp.Item?.role?.S;
    if (actorRole !== "admin" && actorRole !== "instructor") {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const courseResp = await client.send(
      new GetItemCommand({
        TableName: coursesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId: { S: courseId },
        },
        ConsistentRead: true,
      }),
    );
    if (!courseResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Course not found" }) };
    }
    const courseName = courseResp.Item.name?.S ?? `Kurs ${courseId}`;
    const courseTime = courseResp.Item.time?.S ?? "";
    const staticParticipants = asStringList(courseResp.Item.participants);

    const overrideKey = `${courseId}_${date}`;
    const overrideResp = await client.send(
      new GetItemCommand({
        TableName: overridesTable,
        Key: {
          tenantId: { S: tenantId },
          courseId_date: { S: overrideKey },
        },
        ConsistentRead: true,
      }),
    );

    const bookedParticipants = overrideResp.Item
      ? asStringList(overrideResp.Item.participants)
      : staticParticipants;
    const swappedInParticipants = overrideResp.Item ? asStringList(overrideResp.Item.swapped) : [];
    const waitlistParticipants = overrideResp.Item ? asStringList(overrideResp.Item.waitlist) : [];
    const bookedSet = new Set(bookedParticipants);
    const alreadyCancelledParticipants = staticParticipants.filter((userId) => !bookedSet.has(userId));
    const alreadyCancelledSet = new Set(alreadyCancelledParticipants);
    console.info("cancelCourseDate participant groups", {
      tenantId,
      courseId,
      date,
      staticParticipantsCount: staticParticipants.length,
      staticParticipants: dedupeUsers(staticParticipants),
      bookedParticipantsCount: bookedParticipants.length,
      bookedParticipants: dedupeUsers(bookedParticipants),
      swappedInParticipantsCount: swappedInParticipants.length,
      swappedInParticipants: dedupeUsers(swappedInParticipants),
      waitlistParticipantsCount: waitlistParticipants.length,
      waitlistParticipants: dedupeUsers(waitlistParticipants),
      alreadyCancelledParticipantsCount: alreadyCancelledParticipants.length,
      alreadyCancelledParticipants: dedupeUsers(alreadyCancelledParticipants),
      overrideFound: Boolean(overrideResp.Item),
    });

    const swapsResp = await client.send(
      new ScanCommand({
        TableName: swapsTable,
        FilterExpression:
          "tenantId = :tenantId AND ((fromCourseId = :courseId AND fromDate = :date) OR (toCourseId = :courseId AND toDate = :date))",
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
          ":courseId": { S: courseId },
          ":date": { S: date },
        },
      }),
    );
    const relatedSwaps = swapsResp.Items ?? [];
    const outgoingSwapsFromCancelledParticipants = relatedSwaps
      .filter(
        (item) =>
          item.fromCourseId?.S === courseId &&
          item.fromDate?.S === date &&
          item.toDate?.S &&
          isIsoDateInFuture(item.toDate.S) &&
          item.user?.S &&
          alreadyCancelledSet.has(item.user.S) &&
          item.status?.S === "pending",
      )
      .map((item) => item.user!.S!);

    const toDeleteSwaps = relatedSwaps.filter((item) => {
      if (item.toCourseId?.S === courseId && item.toDate?.S === date) return true;
      if (item.fromCourseId?.S === courseId && item.fromDate?.S === date) {
        const swapUser = item.user?.S ?? "";
        if (item.status?.S === "pending") {
          return rollbackPendingWaitlistSwaps;
        }
        if (item.status?.S !== "active") return false;
        if (!alreadyCancelledSet.has(swapUser)) return false;
        const toDate = item.toDate?.S ?? "";
        if (!toDate || !isIsoDateInFuture(toDate)) return false;
        return rollbackSuccessfulSwaps;
      }
      return false;
    });
    console.info("cancelCourseDate swap cleanup plan", {
      tenantId,
      courseId,
      date,
      relatedSwapsCount: relatedSwaps.length,
      swapsToDeleteCount: toDeleteSwaps.length,
      outgoingSwapsFromCancelledParticipantsCount: outgoingSwapsFromCancelledParticipants.length,
      outgoingSwapsFromCancelledParticipants: dedupeUsers(outgoingSwapsFromCancelledParticipants),
    });

    let deletedSwapsCount = 0;
    const warningCodes = new Set<CancelCourseDateWarningCode>();
    const waitlistCleanupByOverride = new Map<string, Set<string>>();
    for (const swapItem of toDeleteSwaps) {
      if (!swapItem.user_swapId?.S) {
        console.warn("cancelCourseDate skip swap delete without key", {
          tenantId,
          courseId,
          date,
          swapUser: swapItem.user?.S ?? null,
        });
        continue;
      }
      await client.send(
        new DeleteItemCommand({
          TableName: swapsTable,
          Key: {
            tenantId: { S: tenantId },
            user_swapId: { S: swapItem.user_swapId.S },
          },
        }),
      );
      deletedSwapsCount += 1;
      const swapStatus = swapItem.status?.S ?? "";
      const targetCourseId = swapItem.toCourseId?.S ?? "";
      const targetDate = swapItem.toDate?.S ?? "";
      const swapUser = swapItem.user?.S ?? "";
      if (
        swapStatus === "pending" &&
        targetCourseId &&
        targetDate &&
        swapUser
      ) {
        const targetOverrideKey = `${targetCourseId}_${targetDate}`;
        const existingUsers = waitlistCleanupByOverride.get(targetOverrideKey) ?? new Set<string>();
        existingUsers.add(swapUser);
        waitlistCleanupByOverride.set(targetOverrideKey, existingUsers);
      }
    }
    let waitlistCleanupOverridesTouched = 0;
    let waitlistCleanupUsersRemoved = 0;
    for (const [targetOverrideKey, usersToRemove] of waitlistCleanupByOverride.entries()) {
      try {
        const targetOverrideResp = await client.send(
          new GetItemCommand({
            TableName: overridesTable,
            Key: {
              tenantId: { S: tenantId },
              courseId_date: { S: targetOverrideKey },
            },
            ConsistentRead: true,
          }),
        );
        if (!targetOverrideResp.Item) continue;
        const waitlistBefore = asStringList(targetOverrideResp.Item.waitlist);
        const waitlistAfter = waitlistBefore.filter((userId) => !usersToRemove.has(userId));
        if (waitlistAfter.length === waitlistBefore.length) continue;
        waitlistCleanupOverridesTouched += 1;
        waitlistCleanupUsersRemoved += waitlistBefore.length - waitlistAfter.length;
        await client.send(
          new PutItemCommand({
            TableName: overridesTable,
            Item: {
              ...targetOverrideResp.Item,
              waitlist: { L: waitlistAfter.map((userId) => ({ S: userId })) },
              actorUserId: { S: actorUserId },
            },
          }),
        );
      } catch (waitlistCleanupError) {
        warningCodes.add("waitlist_cleanup_failed");
        console.warn("cancelCourseDate waitlist cleanup warning", {
          tenantId,
          courseId,
          date,
          targetOverrideKey,
          usersToRemove: Array.from(usersToRemove),
          error: waitlistCleanupError,
        });
      }
    }
    console.info("cancelCourseDate swap cleanup done", {
      tenantId,
      courseId,
      date,
      deletedSwapsCount,
      waitlistCleanupOverridesTouched,
      waitlistCleanupUsersRemoved,
    });

    const excludedDates = new Set(asStringList(courseResp.Item.excludedDates));
    excludedDates.add(date);
    await client.send(
      new PutItemCommand({
        TableName: coursesTable,
        Item: {
          ...courseResp.Item,
          excludedDates: { L: Array.from(excludedDates).sort((a, b) => a.localeCompare(b)).map((d) => ({ S: d })) },
        },
      }),
    );

    await client.send(
      new PutItemCommand({
        TableName: overridesTable,
        Item: {
          tenantId: { S: tenantId },
          courseId_date: { S: overrideKey },
          courseId: { S: courseId },
          date: { S: date },
          participants: { L: [] },
          swapped: { L: [] },
          waitlist: { L: [] },
          actorUserId: { S: actorUserId },
        },
      }),
    );

    const notifyUsers = new Set([
      ...bookedParticipants,
      ...swappedInParticipants,
      ...waitlistParticipants,
      ...alreadyCancelledParticipants,
    ]);
    const notifyUserList = dedupeUsers(Array.from(notifyUsers));
    console.info("cancelCourseDate notification plan", {
      tenantId,
      courseId,
      date,
      notifyUsersCount: notifyUserList.length,
      notifyUsers: notifyUserList,
      participantsTableConfigured: Boolean(participantsTable),
      sesConfigured: Boolean(sesSourceEmail),
    });

    let mailSentCount = 0;
    let mailSkippedNoProfileCount = 0;
    let mailSkippedInvitedCount = 0;
    let mailFailedCount = 0;
    if (participantsTable && sesSourceEmail && notifyUserList.length > 0) {
      try {
        const baseUrl = resolveAppBaseUrlForTenant(tenantId);
        const mailSummary = await notifyStudioTermCancelled(client, {
          tenantId,
          participantUserIds: notifyUserList,
          courseName,
          dateIso: date,
          time: courseTime,
          participantsTable,
          sesSourceEmail,
          baseUrl,
        });
        mailSentCount = mailSummary.mailSentCount;
        mailSkippedNoProfileCount = mailSummary.mailSkippedNoProfileCount;
        mailSkippedInvitedCount = mailSummary.mailSkippedInvitedCount;
        mailFailedCount = mailSummary.mailFailedCount;
        if (mailFailedCount > 0) {
          warningCodes.add("participant_mail_failed");
        }
      } catch (notificationError) {
        warningCodes.add("participant_mail_failed");
        console.warn("cancelCourseDate participant notification failed", {
          tenantId,
          courseId,
          date,
          error: notificationError,
        });
      }
      console.info("cancelCourseDate mail summary", {
        tenantId,
        courseId,
        date,
        mailSentCount,
        mailSkippedNoProfileCount,
        mailSkippedInvitedCount,
        mailFailedCount,
        requestedRecipients: notifyUserList.length,
      });
    } else {
      console.info("cancelCourseDate mail skipped entirely", {
        tenantId,
        courseId,
        date,
        reason: !participantsTable
          ? "participants_table_missing"
          : !sesSourceEmail
            ? "ses_source_email_missing"
            : "no_recipients",
      });
    }

    if (studioNotificationEmails.length > 0 && sesSourceEmail) {
      const activeSwapsWithOriginOnCancelledDate = relatedSwaps
        .filter((item) => item.fromCourseId?.S === courseId && item.fromDate?.S === date && item.status?.S === "active")
        .map((item) => ({
          userId: item.user?.S ?? "",
          toCourseId: item.toCourseId?.S ?? "",
          toDate: item.toDate?.S ?? "",
        }));
      const pendingSwapsWithOriginOnCancelledDate = relatedSwaps
        .filter((item) => item.fromCourseId?.S === courseId && item.fromDate?.S === date && item.status?.S === "pending")
        .map((item) => ({
          userId: item.user?.S ?? "",
          toCourseId: item.toCourseId?.S ?? "",
          toDate: item.toDate?.S ?? "",
        }));
      const pendingSwapsToCancelledDateWithOtherOrigin = relatedSwaps
        .filter((item) => item.toCourseId?.S === courseId && item.toDate?.S === date && item.status?.S === "pending")
        .map((item) => ({
          userId: item.user?.S ?? "",
          fromCourseId: item.fromCourseId?.S ?? "",
          fromDate: item.fromDate?.S ?? "",
          fromOriginCancelled: alreadyCancelledSet.has(item.user?.S ?? ""),
        }));
      const cancelledWithoutSwap = alreadyCancelledParticipants.filter(
        (userId) =>
          !outgoingSwapsFromCancelledParticipants.includes(userId) &&
          !activeSwapsWithOriginOnCancelledDate.some((swap) => swap.userId === userId),
      );
      const cancelledWithActiveSwap = alreadyCancelledParticipants.filter((userId) =>
        activeSwapsWithOriginOnCancelledDate.some((swap) => swap.userId === userId),
      );

      const reportHtml = `
        <h3>Terminabsage Report</h3>
        <p>Kurs: <strong>${courseName}</strong> (${courseId})</p>
        <p>Termin: <strong>${date}</strong></p>
        <p>Actor: <strong>${actorUserId}</strong></p>
        <p>Regulär geplant: ${dedupeUsers(bookedParticipants).join(", ") || "-"}</p>
        <p>Davon reingetauscht: ${dedupeUsers(swappedInParticipants).join(", ") || "-"}</p>
        <p>Warteliste am abgesagten Termin: ${dedupeUsers(waitlistParticipants).join(", ") || "-"}</p>
        <p>Aktive Swaps (Ursprung abgesagter Termin): ${activeSwapsWithOriginOnCancelledDate.map((s) => `${s.userId} -> ${s.toCourseId}/${s.toDate}`).join("; ") || "-"}</p>
        <p>Bereits abgemeldet mit aktivem Swap: ${dedupeUsers(cancelledWithActiveSwap).join(", ") || "-"}</p>
        <p>Bereits abgemeldet ohne Swap: ${dedupeUsers(cancelledWithoutSwap).join(", ") || "-"}</p>
        <p>Bereits abgemeldet mit pending Swap: ${dedupeUsers(outgoingSwapsFromCancelledParticipants).join(", ") || "-"}</p>
        <p>Rollback erfolgreiche Tauschs: ${rollbackSuccessfulSwaps ? "ja" : "nein"}</p>
        <p>Rollback pending Wartelisten-Tauschs: ${rollbackPendingWaitlistSwaps ? "ja" : "nein"}</p>
        <p>Pending Swaps mit anderem Ursprung (Ziel abgesagter Termin): ${pendingSwapsToCancelledDateWithOtherOrigin.map((s) => `${s.userId} <- ${s.fromCourseId}/${s.fromDate} (originCancelled=${s.fromOriginCancelled})`).join("; ") || "-"}</p>
        <p>Pending Swaps mit Ursprung abgesagter Termin: ${pendingSwapsWithOriginOnCancelledDate.map((s) => `${s.userId} -> ${s.toCourseId}/${s.toDate}`).join("; ") || "-"}</p>
        <hr />
        <p>Mail Summary: sent=${mailSentCount}, skippedNoProfile=${mailSkippedNoProfileCount}, skippedInvited=${mailSkippedInvitedCount}, failed=${mailFailedCount}</p>
      `;
      try {
        await ses.send(
          new SendEmailCommand({
            Source: sesSourceEmail,
            Destination: { ToAddresses: studioNotificationEmails },
            Message: {
              Subject: { Data: `Studio-Report Terminabsage: ${courseName} (${date})` },
              Body: { Html: { Data: reportHtml } },
            },
          }),
        );
        console.info("cancelCourseDate studio report sent", {
          tenantId,
          courseId,
          date,
          recipients: studioNotificationEmails,
        });
      } catch (reportError) {
        warningCodes.add("studio_report_failed");
        console.warn("cancelCourseDate studio report mail warning", {
          tenantId,
          courseId,
          date,
          recipients: studioNotificationEmails,
          error: reportError,
        });
      }
    } else {
      console.info("cancelCourseDate studio report skipped", {
        tenantId,
        courseId,
        date,
        reason: studioNotificationEmails.length === 0 ? "no_report_recipients" : "ses_source_email_missing",
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        courseId: Number(courseId),
        date,
        operationWarnings: Array.from(warningCodes),
        outcome: {
          swaps: {
            relatedCount: relatedSwaps.length,
            deletedCount: deletedSwapsCount,
          },
          waitlistCleanup: {
            overridesTouched: waitlistCleanupOverridesTouched,
            usersRemoved: waitlistCleanupUsersRemoved,
          },
          notifications: {
            plannedRecipientsCount: notifyUserList.length,
            sentCount: mailSentCount,
            skippedNoProfileCount: mailSkippedNoProfileCount,
            skippedInvitedCount: mailSkippedInvitedCount,
            failedCount: mailFailedCount,
          },
        },
        affected: {
          bookedParticipants,
          swappedInParticipants,
          waitlistParticipants,
          alreadyCancelledParticipants,
          outgoingSwapsFromCancelledParticipants,
        },
      }),
    };
  } catch (error) {
    console.error("cancelCourseDate failed", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to cancel course date" }) };
  }
};

