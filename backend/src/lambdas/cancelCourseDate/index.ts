import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { dynamoClient } from "../shared/dynamoClient";
import { deriveParticipantStatus } from "../shared/participantStatus";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;
const ses = new SESClient({});
const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";

type CancelBody = {
  rollbackOutgoingSwapsFromCancelledParticipants?: boolean;
  notifyAlreadyCancelledParticipants?: boolean;
};

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

async function resolveParticipantEmail(
  participantsTable: string,
  tenantId: string,
  requestedUserId: string,
): Promise<{
  email?: string;
  resolvedUserId?: string;
  status?: "no_login" | "invited" | "active";
  lookupSource?: "exact" | "normalized";
}> {
  const exactProfileResp = await client.send(
    new GetItemCommand({
      TableName: participantsTable,
      Key: {
        tenantId: { S: tenantId },
        userId: { S: requestedUserId },
      },
      ConsistentRead: true,
    }),
  );
  const exactEmail = exactProfileResp.Item?.email?.S?.trim();
  const exactStatus = exactProfileResp.Item
    ? deriveParticipantStatus({
        authUserId: exactProfileResp.Item.authUserId?.S,
        inviteSentAt: exactProfileResp.Item.inviteSentAt?.S,
        inviteCompletedAt: exactProfileResp.Item.inviteCompletedAt?.S,
      })
    : undefined;
  if (exactProfileResp.Item && exactEmail) {
    return {
      email: exactEmail,
      resolvedUserId: requestedUserId,
      status: exactStatus,
      lookupSource: "exact",
    };
  }

  let normalizedLookupResp;
  try {
    normalizedLookupResp = await client.send(
      new QueryCommand({
        TableName: participantsTable,
        IndexName: PARTICIPANTS_NORMALIZED_INDEX,
        KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
          ":userIdNormalized": { S: requestedUserId.toLowerCase() },
        },
        Limit: 1,
      }),
    );
  } catch (error) {
    console.warn("cancelCourseDate normalized participant lookup failed", {
      tenantId,
      requestedUserId,
      indexName: PARTICIPANTS_NORMALIZED_INDEX,
      error,
    });
    return {};
  }
  const normalizedItem = normalizedLookupResp.Items?.[0];
  const normalizedEmail = normalizedItem?.email?.S?.trim();
  const normalizedUserId = normalizedItem?.userId?.S?.trim();
  const normalizedStatus = normalizedItem
    ? deriveParticipantStatus({
        authUserId: normalizedItem.authUserId?.S,
        inviteSentAt: normalizedItem.inviteSentAt?.S,
        inviteCompletedAt: normalizedItem.inviteCompletedAt?.S,
      })
    : undefined;
  if (normalizedItem && normalizedEmail) {
    return {
      email: normalizedEmail,
      resolvedUserId: normalizedUserId || requestedUserId,
      status: normalizedStatus,
      lookupSource: "normalized",
    };
  }

  return {};
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const swapsTable = process.env.SWAPS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "";
  const studioNotificationEmails = parseCsvEmails(process.env.STUDIO_NOTIFICATION_EMAILS);
  if (!coursesTable || !overridesTable || !swapsTable || !membershipsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Required env vars are missing for cancelCourseDate" }),
    };
  }

  const courseId = event.pathParameters?.courseId?.trim();
  const date = event.pathParameters?.date?.trim();
  if (!courseId || !date) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing courseId or date in path" }) };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const body = parseBody(event);
  const rollbackOutgoing = body.rollbackOutgoingSwapsFromCancelledParticipants === true;
  const notifyAlreadyCancelled = body.notifyAlreadyCancelledParticipants !== false;

  try {
    console.info("cancelCourseDate start", {
      tenantId,
      actorUserId,
      courseId,
      date,
      rollbackOutgoing,
      notifyAlreadyCancelled,
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
        if (item.status?.S !== "pending") return false;
        if (!alreadyCancelledSet.has(swapUser)) return true;
        const toDate = item.toDate?.S ?? "";
        if (!toDate || !isIsoDateInFuture(toDate)) return false;
        return rollbackOutgoing;
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
    }
    console.info("cancelCourseDate swap cleanup done", {
      tenantId,
      courseId,
      date,
      deletedSwapsCount,
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

    const notifyUsers = new Set([...bookedParticipants, ...swappedInParticipants, ...waitlistParticipants]);
    if (notifyAlreadyCancelled) {
      alreadyCancelledParticipants.forEach((userId) => notifyUsers.add(userId));
    }
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
    let mailSkippedNoEmailCount = 0;
    let mailSkippedInvitedCount = 0;
    let mailFailedCount = 0;
    let normalizedLookupUsedCount = 0;
    if (participantsTable && sesSourceEmail && notifyUsers.size > 0) {
      for (const userId of notifyUsers) {
        const { email, resolvedUserId, status, lookupSource } = await resolveParticipantEmail(
          participantsTable,
          tenantId,
          userId,
        );
        console.info("cancelCourseDate participant notification candidate", {
          tenantId,
          courseId,
          date,
          requestedUserId: userId,
          resolvedUserId: resolvedUserId ?? null,
          participantStatus: status ?? null,
          lookupSource: lookupSource ?? null,
          hasEmail: Boolean(email),
        });
        if (!email) {
          mailSkippedNoProfileCount += 1;
          console.warn("cancelCourseDate skip mail: participant profile missing", {
            tenantId,
            courseId,
            date,
            userId,
          });
          continue;
        }
        if (status === "invited") {
          mailSkippedInvitedCount += 1;
          console.info("cancelCourseDate skip mail: participant invited only", {
            tenantId,
            courseId,
            date,
            requestedUserId: userId,
            resolvedUserId: resolvedUserId ?? userId,
          });
          continue;
        }
        if (resolvedUserId && resolvedUserId !== userId) {
          normalizedLookupUsedCount += 1;
          console.info("cancelCourseDate participant email resolved via normalized lookup", {
            tenantId,
            courseId,
            date,
            requestedUserId: userId,
            resolvedUserId,
          });
        }
        try {
          await ses.send(
            new SendEmailCommand({
              Source: sesSourceEmail,
              Destination: { ToAddresses: [email] },
              Message: {
                Subject: { Data: `Terminabsage: ${courseName} (${date})` },
                Body: {
                  Html: {
                    Data: `<p>Der Termin <strong>${date}</strong> im Kurs <strong>${courseName}</strong> wurde abgesagt.</p>`,
                  },
                },
              },
            }),
          );
          mailSentCount += 1;
          console.info("cancelCourseDate mail sent", {
            tenantId,
            courseId,
            date,
            userId,
            email,
          });
        } catch (mailError) {
          console.warn("cancelCourseDate mail warning", { tenantId, userId, date, error: mailError });
        }
      }
      console.info("cancelCourseDate mail summary", {
        tenantId,
        courseId,
        date,
        mailSentCount,
        mailSkippedNoProfileCount,
        mailSkippedNoEmailCount,
        mailSkippedInvitedCount,
        mailFailedCount,
        requestedRecipients: notifyUserList.length,
        normalizedLookupUsedCount,
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

      const reportHtml = `
        <h3>Terminabsage Report</h3>
        <p>Kurs: <strong>${courseName}</strong> (${courseId})</p>
        <p>Termin: <strong>${date}</strong></p>
        <p>Actor: <strong>${actorUserId}</strong></p>
        <p>Regulär betroffen: ${dedupeUsers(bookedParticipants).join(", ") || "-"}</p>
        <p>Reingetauscht betroffen: ${dedupeUsers(swappedInParticipants).join(", ") || "-"}</p>
        <p>Aktive Swaps (Ursprung abgesagter Termin): ${activeSwapsWithOriginOnCancelledDate.map((s) => `${s.userId} -> ${s.toCourseId}/${s.toDate}`).join("; ") || "-"}</p>
        <p>Abgesagt ohne Swap: ${dedupeUsers(cancelledWithoutSwap).join(", ") || "-"}</p>
        <p>Abgesagt mit pending Swaps: ${dedupeUsers(outgoingSwapsFromCancelledParticipants).join(", ") || "-"}</p>
        <p>Pending Swaps mit anderem Ursprung (Ziel abgesagter Termin): ${pendingSwapsToCancelledDateWithOtherOrigin.map((s) => `${s.userId} <- ${s.fromCourseId}/${s.fromDate} (originCancelled=${s.fromOriginCancelled})`).join("; ") || "-"}</p>
        <p>Pending Swaps mit Ursprung abgesagter Termin: ${pendingSwapsWithOriginOnCancelledDate.map((s) => `${s.userId} -> ${s.toCourseId}/${s.toDate}`).join("; ") || "-"}</p>
        <hr />
        <p>Mail Summary: sent=${mailSentCount}, skippedNoProfile=${mailSkippedNoProfileCount}, skippedNoEmail=${mailSkippedNoEmailCount}, skippedInvited=${mailSkippedInvitedCount}, failed=${mailFailedCount}</p>
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

