import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand, UpdateItemCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import {
  Swap,
  CourseDateOverride,
  Course,
  canPromoteFromWaitlist,
  resolveCancellationSwapCutoffMinutes,
} from "@yogaswap/shared";
import { getTenantContext } from "../shared/tenantContext";
import { dynamoClient } from "../shared/dynamoClient";
import { mapOverrideItem } from "../shared/overrideDynamo";
import { loadTenantSettings } from "../shared/tenantSettingsLoader";

const client = dynamoClient;

const DEFAULT_NO_AUTOMATION_MINUTES = 60;

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function includesUserCaseInsensitive(values: string[] | undefined, user: string): boolean {
  if (!values) return false;
  const target = normalized(user);
  return values.some((entry) => normalized(entry) === target);
}

function removeUserCaseInsensitive(values: string[] | undefined, user: string): string[] {
  if (!values) return [];
  const target = normalized(user);
  return values.filter((entry) => normalized(entry) !== target);
}

function addUserUniqueCaseInsensitive(values: string[] | undefined, user: string): string[] {
  const base = values ?? [];
  if (includesUserCaseInsensitive(base, user)) return base;
  return [...base, user];
}

// Hilfsfunktion: Prüft, ob ein Kursbeginn mindestens PROMOTION_TIME_BUFFER_MINUTES in der Zukunft liegt
function isCourseInFuture(
  courseDate: string,
  courseTime: string,
  now: Date,
  noAutomationMinutes: number,
): boolean {
  try {
    // Kombiniere Datum (YYYY-MM-DD) und Uhrzeit (HH:mm) zu einem Date-Objekt
    const [year, month, day] = courseDate.split('-').map(Number);
    const [hours, minutes] = courseTime.split(':').map(Number);
    const courseStart = new Date(year, month - 1, day, hours, minutes);
    
    // Aktuelle Zeit + Sperrfenster für automatische Promotion
    const bufferTime = new Date(now.getTime() + noAutomationMinutes * 60 * 1000);
    
    // Prüfe, ob Kursbeginn nach bufferTime liegt
    return courseStart >= bufferTime;
  } catch (err) {
    console.error('Error parsing course date/time:', { courseDate, courseTime, error: err });
    return false; // Ignoriere ungültige Termine
  }
}

// Hilfsfunktion: Override aktualisieren (tenant-scoped)
async function updateOverrideHelper(
  tenantId: string,
  courseId: number,
  date: string,
  updates: {
    participants?: string[];
    swapped?: string[];
    waitlist?: string[];
  }
): Promise<void> {
  const updateExpressionParts: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  if (updates.participants) {
    updateExpressionParts.push("#participants = :participants");
    expressionAttributeNames["#participants"] = "participants";
    expressionAttributeValues[":participants"] = { L: updates.participants.map((p) => ({ S: p })) };
  }
  if (updates.swapped) {
    updateExpressionParts.push("#swapped = :swapped");
    expressionAttributeNames["#swapped"] = "swapped";
    expressionAttributeValues[":swapped"] = { L: updates.swapped.map((s) => ({ S: s })) };
  }
  if (updates.waitlist) {
    updateExpressionParts.push("#waitlist = :waitlist");
    expressionAttributeNames["#waitlist"] = "waitlist";
    expressionAttributeValues[":waitlist"] = { L: updates.waitlist.map((w) => ({ S: w })) };
  }

  if (updateExpressionParts.length === 0) {
    console.warn('No updates provided for override:', { courseId, date });
    return;
  }

  const courseId_date = `${courseId}_${date}`;
  const command = new UpdateItemCommand({
    TableName: process.env.OVERRIDES_TABLE,
    Key: {
      tenantId: { S: tenantId },
      courseId_date: { S: courseId_date },
    },
    UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "ALL_NEW", // Für Debugging
  });

  try {
    const result = await client.send(command);
    console.log('updateOverrideHelper success:', {
      courseId,
      date,
      updates: Object.keys(updates),
      updatedAttributes: result.Attributes,
    });
  } catch (err) {
    console.error('Error updating override:', err);
    throw err;
  }
}

// Hilfsfunktion: Override erstellen (tenant-scoped)
async function createOverrideHelper(tenantId: string, override: CourseDateOverride): Promise<void> {
  const courseId_date = `${override.courseId}_${override.date}`;
  const command = new PutItemCommand({
    TableName: process.env.OVERRIDES_TABLE,
    Item: {
      tenantId: { S: tenantId },
      courseId_date: { S: courseId_date },
      courseId: { S: override.courseId.toString() },
      date: { S: override.date },
      participants: { L: (override.participants || []).map((p) => ({ S: p })) },
      swapped: { L: (override.swapped || []).map((s) => ({ S: s })) },
      waitlist: { L: (override.waitlist || []).map((w) => ({ S: w })) },
      shortNoticeCancellations: {
        L: (override.shortNoticeCancellations || []).map((w) => ({ S: w })),
      },
    },
  });

  try {
    console.log('createOverrideHelper command:', JSON.stringify(command.input, null, 2));
    await client.send(command);
    console.log('createOverrideHelper success:', { courseId: override.courseId, date: override.date });
  } catch (err) {
    console.error('Error creating override:', err);
    throw err;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { tenantId, userId } = getTenantContext(event);
    console.log("processPromotions tenant context", { tenantId, userId });

    let body;
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
    }
    body = JSON.parse(event.body);
    // Extrahiere currentUser (anpassen je nach Auth-Setup)
    const currentUser = event.requestContext?.authorizer?.principalId || body.currentUser || null;

    let noAutomationMinutes = DEFAULT_NO_AUTOMATION_MINUTES;
    const tenantsTable = process.env.TENANTS_TABLE;
    if (tenantsTable) {
      const tenantSettings = await loadTenantSettings(client, tenantsTable, tenantId);
      noAutomationMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
    }

    let iterations = 0;
    let changed = true;
    const maxIterations = 10;
    let promotedSwaps: Swap[] = [];

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // 1) Alle pending Swaps des Tenants laden
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
      console.log('pendingSwaps:', pendingSwaps);

      // 2) Alle Courses des Tenants laden
      const coursesCommand = new QueryCommand({
        TableName: process.env.COURSES_TABLE,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      });
      const coursesData = await client.send(coursesCommand);
      const courses: Course[] = (coursesData.Items || []).map((item) => ({
        id: Number(item.id?.N ?? item.courseId?.S ?? 0),
        name: item.name.S!,
        weekday: item.weekday.S!,
        time: item.time.S!,
        capacity: Number(item.capacity.N!),
        overbookLimit: item.overbookLimit?.N ? Number(item.overbookLimit.N) : 0,
        participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
        dates: item.dates.L ? item.dates.L.map((d: any) => d.S) : [],
      }));
      console.log('courses:', courses);

      // 3) Alle Overrides des Tenants laden
      const overridesCommand = new QueryCommand({
        TableName: process.env.OVERRIDES_TABLE,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      });
      const overridesData = await client.send(overridesCommand);
      const allOverrides: CourseDateOverride[] = (overridesData.Items || []).map((item) =>
        mapOverrideItem(item),
      );

      // Filtere Overrides: zukünftige Termine oder heutige Termine mit Puffer
      const now = new Date();
      const futureOverrides = allOverrides.filter((o) => {
        const course = courses.find((c) => c.id === o.courseId);
        if (!course) return false;
        return isCourseInFuture(o.date, course.time, now, noAutomationMinutes);
      });
      console.log('futureOverrides:', futureOverrides);

      // 4) Durchsuche Overrides nach freien Plätzen mit Warteliste
      for (const override of futureOverrides) {
        console.log('override:', override);
        const overrideCourse = courses.find((c) => c.id === override.courseId);
        if (!overrideCourse) continue;

        const participantCount = override.participants.length;
        console.log('waitlist promotion check:', {
          participantCount,
          capacity: overrideCourse.capacity,
          overbookLimit: overrideCourse.overbookLimit ?? 0,
        });
        if (!canPromoteFromWaitlist(participantCount, overrideCourse)) continue;

        // Wähle promotedUser: currentUser priorisieren, sonst ersten Waitlist-Eintrag
        // mit passendem pending Swap (stale Waitlist-Einträge überspringen).
        const waitlistCandidates = override.waitlist ?? [];
        const prioritizedCandidates =
          currentUser && includesUserCaseInsensitive(waitlistCandidates, currentUser)
            ? [
                currentUser,
                ...waitlistCandidates.filter(
                  (entry) => normalized(entry) !== normalized(currentUser),
                ),
              ]
            : waitlistCandidates;

        let correspondingSwap: Swap | undefined;
        for (const candidate of prioritizedCandidates) {
          const match = pendingSwaps.find(
            (s) =>
              normalized(s.user) === normalized(candidate) &&
              s.toCourseId === override.courseId &&
              s.toDate === override.date,
          );
          if (match) {
            correspondingSwap = match;
            break;
          }
        }
        console.log(
          'promotion candidate resolution:',
          {
            overrideCourseId: override.courseId,
            overrideDate: override.date,
            waitlistCandidates: prioritizedCandidates,
            correspondingSwap,
          },
        );
        if (!correspondingSwap) continue;

        const promotedSwapUser = correspondingSwap.user;
        changed = true;
        promotedSwaps.push(correspondingSwap);

        // 5) Swap auf 'active' setzen
        const swapId = `${correspondingSwap.fromDate}_${correspondingSwap.fromCourseId}_${correspondingSwap.toDate}_${correspondingSwap.toCourseId}`;
        const user_swapId = `${promotedSwapUser}#${swapId}`;
        const updateSwapCommand = new UpdateItemCommand({
          TableName: process.env.SWAPS_TABLE,
          Key: {
            tenantId: { S: tenantId },
            user_swapId: { S: user_swapId },
          },
          UpdateExpression: "SET #status = :status, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": { S: "active" },
            ":fromStatus": { S: `${correspondingSwap.fromDate}_${correspondingSwap.fromCourseId}_active` },
            ":toStatus": { S: `${correspondingSwap.toDate}_${correspondingSwap.toCourseId}_active` },
          },
        });
        await client.send(updateSwapCommand);
        console.log(`[processPromotions] Swap updated to active: ${swapId}`);

        // 6) Ziel-Override aktualisieren
        const newParticipants = addUserUniqueCaseInsensitive(override.participants, promotedSwapUser);
        const newSwapped = addUserUniqueCaseInsensitive(override.swapped, promotedSwapUser);
        const newWaitlist = removeUserCaseInsensitive(override.waitlist, promotedSwapUser);
        console.log('Updating target override:', {
          courseId: override.courseId,
          date: override.date,
          newParticipants,
          newSwapped,
          newWaitlist,
        });
        await updateOverrideHelper(tenantId, override.courseId, override.date, {
          participants: newParticipants,
          swapped: newSwapped,
          waitlist: newWaitlist,
        });

        // 7) Ursprung-Override bereinigen
        const originOverride = allOverrides.find(
          (o) => o.courseId === correspondingSwap.fromCourseId && o.date === correspondingSwap.fromDate
        );
        if (originOverride) {
          const newOriginParticipants = removeUserCaseInsensitive(originOverride.participants, promotedSwapUser);
          const newOriginSwapped = removeUserCaseInsensitive(originOverride.swapped, promotedSwapUser);
          const newOriginWaitlist = removeUserCaseInsensitive(originOverride.waitlist, promotedSwapUser);
          console.log('Updating origin override:', {
            courseId: correspondingSwap.fromCourseId,
            date: correspondingSwap.fromDate,
            newOriginParticipants,
            newOriginSwapped,
            newOriginWaitlist,
          });
          await updateOverrideHelper(tenantId, correspondingSwap.fromCourseId, correspondingSwap.fromDate, {
            participants: newOriginParticipants,
            swapped: newOriginSwapped,
            waitlist: newOriginWaitlist,
          });
        } else {
          const originCourse = courses.find((c) => c.id === correspondingSwap.fromCourseId);
          if (originCourse && includesUserCaseInsensitive(originCourse.participants, promotedSwapUser)) {
            const newOriginOverride: CourseDateOverride = {
              courseId: correspondingSwap.fromCourseId,
              date: correspondingSwap.fromDate,
              participants: removeUserCaseInsensitive(originCourse.participants, promotedSwapUser),
              swapped: [],
              waitlist: [],
            };
            console.log('Creating origin override:', newOriginOverride);
            await createOverrideHelper(tenantId, newOriginOverride);
          }
        }

        // 8) Andere pending Swaps des Users stornieren
        const pendingOriginSwaps = pendingSwaps.filter(
          (s) =>
            normalized(s.user) === normalized(promotedSwapUser) &&
            s.fromCourseId === correspondingSwap.fromCourseId &&
            s.fromDate === correspondingSwap.fromDate &&
            (s.toCourseId !== correspondingSwap.toCourseId || s.toDate !== correspondingSwap.toDate)
        );
        for (const originSwap of pendingOriginSwaps) {
          const originSwapId = `${originSwap.fromDate}_${originSwap.fromCourseId}_${originSwap.toDate}_${originSwap.toCourseId}`;
          const originUser_swapId = `${originSwap.user}#${originSwapId}`;
          const deleteCommand = new DeleteItemCommand({
            TableName: process.env.SWAPS_TABLE,
            Key: {
              tenantId: { S: tenantId },
              user_swapId: { S: originUser_swapId },
            },
          });
          console.log('Deleting swap:', { originSwapId, user: originSwap.user });
          await client.send(deleteCommand);

          const targetOriginOverride = allOverrides.find(
            (o) => o.courseId === originSwap.toCourseId && o.date === originSwap.toDate
          );
          if (targetOriginOverride) {
            const newTargetWaitlist = removeUserCaseInsensitive(targetOriginOverride.waitlist, promotedSwapUser);
            console.log('Updating target waitlist for cancelled swap:', {
              courseId: originSwap.toCourseId,
              date: originSwap.toDate,
              newTargetWaitlist,
            });
            await updateOverrideHelper(tenantId, originSwap.toCourseId, originSwap.toDate, {
              waitlist: newTargetWaitlist,
            });
          }

          console.log(
            `[processPromotions] Storniert pending Swap: ${originSwap.user} von ${originSwap.fromCourseId}/${originSwap.fromDate} → ${originSwap.toCourseId}/${originSwap.toDate}`
          );
        }

        console.log(
          `[processPromotions] ${promotedSwapUser} nachgerückt von ${correspondingSwap.fromCourseId}/${correspondingSwap.fromDate} → ${override.courseId}/${override.date}`
        );
      }

      if (iterations >= maxIterations) {
        console.warn('[processPromotions] Max iterations reached - potential loop detected');
      }
    }

    // 9) Aktualisierte Swaps und Overrides des Tenants laden
    const updatedSwapsCommand = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: { ":tid": { S: tenantId } },
      ConsistentRead: true,
    });
    const updatedSwapsData = await client.send(updatedSwapsCommand);
    const updatedSwaps: Swap[] = (updatedSwapsData.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId.N || item.fromCourseId.S),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId.N || item.toCourseId.S),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));

    const updatedOverridesCommand = new QueryCommand({
      TableName: process.env.OVERRIDES_TABLE,
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: { ":tid": { S: tenantId } },
      ConsistentRead: true,
    });
    const updatedOverridesData = await client.send(updatedOverridesCommand);
    const updatedOverrides: CourseDateOverride[] = (updatedOverridesData.Items || []).map((item) =>
      mapOverrideItem(item),
    );
    console.log(`[processPromotions] Complete after ${iterations} iterations`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Promotions processed',
        iterations,
        promoted: promotedSwaps.length,
        swaps: updatedSwaps,
        overrides: updatedOverrides,
      }),
    };
  } catch (error) {
    console.error('Error in processPromotions:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Failed to process promotions' }) };
  }
};