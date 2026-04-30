import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;
const ses = new SESClient({});

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const coursesTable = process.env.COURSES_TABLE;
  const overridesTable = process.env.OVERRIDES_TABLE;
  const swapsTable = process.env.SWAPS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "";
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
  const rollbackOutgoing = body.rollbackOutgoingSwapsFromCancelledParticipants !== false;
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
          item.user?.S &&
          alreadyCancelledSet.has(item.user.S) &&
          item.status?.S === "pending",
      )
      .map((item) => item.user!.S!);

    const toDeleteSwaps = relatedSwaps.filter((item) => {
      if (item.toCourseId?.S === courseId && item.toDate?.S === date) return true;
      if (item.fromCourseId?.S === courseId && item.fromDate?.S === date) {
        const swapUser = item.user?.S ?? "";
        if (!alreadyCancelledSet.has(swapUser)) return true;
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

    const notifyUsers = new Set([...bookedParticipants, ...swappedInParticipants]);
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

    if (participantsTable && sesSourceEmail && notifyUsers.size > 0) {
      let mailSentCount = 0;
      let mailSkippedNoProfileCount = 0;
      let mailSkippedNoEmailCount = 0;
      let mailFailedCount = 0;
      for (const userId of notifyUsers) {
        const participantResp = await client.send(
          new GetItemCommand({
            TableName: participantsTable,
            Key: {
              tenantId: { S: tenantId },
              userId: { S: userId },
            },
            ConsistentRead: true,
          }),
        );
        if (!participantResp.Item) {
          mailSkippedNoProfileCount += 1;
          console.warn("cancelCourseDate skip mail: participant profile missing", {
            tenantId,
            courseId,
            date,
            userId,
          });
          continue;
        }
        const email = participantResp.Item?.email?.S?.trim();
        if (!email) {
          mailSkippedNoEmailCount += 1;
          console.warn("cancelCourseDate skip mail: missing email", {
            tenantId,
            courseId,
            date,
            userId,
          });
          continue;
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

