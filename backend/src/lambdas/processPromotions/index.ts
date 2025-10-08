import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, ScanCommand, UpdateItemCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { Swap, CourseDateOverride, Course } from "@yogaswap/shared";

const client = new DynamoDBClient({ region: "eu-central-1" });

// Hilfsfunktion: Override aktualisieren (dynamisch basierend auf Updates)
async function updateOverrideHelper(
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

  const command = new UpdateItemCommand({
    TableName: process.env.OVERRIDES_TABLE,
    Key: {
      courseId: { N: courseId.toString() },
      date: { S: date },
    },
    UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  try {
    console.log('updateOverrideHelper command:', command.input);
    await client.send(command);
    console.log('updateOverrideHelper success:', { courseId, date, updates: Object.keys(updates) });
  } catch (err) {
    console.error('Error updating override:', err);
    throw err;
  }
}

// Hilfsfunktion: Override erstellen (PutItemCommand)
async function createOverrideHelper(override: CourseDateOverride): Promise<void> {
  const command = new PutItemCommand({
    TableName: process.env.OVERRIDES_TABLE,
    Item: {
      courseId: { N: override.courseId.toString() },
      date: { S: override.date },
      participants: { L: (override.participants || []).map((p) => ({ S: p })) },
      swapped: { L: (override.swapped || []).map((s) => ({ S: s })) },
      waitlist: { L: (override.waitlist || []).map((w) => ({ S: w })) },
    },
  });

  try {
    console.log('createOverrideHelper command:', command.input);
    await client.send(command);
    console.log('createOverrideHelper success:', { courseId: override.courseId, date: override.date });
  } catch (err) {
    console.error('Error creating override:', err);
    throw err;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    let body;
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
    }
    body = JSON.parse(event.body);
    const { courses } = body;
    if (!courses || !Array.isArray(courses)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid courses array' }) };
    }

    let iterations = 0;
    let changed = true;
    const maxIterations = 10;
    let promotedSwaps: Swap[] = [];

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // 1) Alle pending Swaps laden (Scan mit Filter)
      const pendingSwapsCommand = new ScanCommand({
        TableName: process.env.SWAPS_TABLE,
        FilterExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": { S: "pending" } },
        ConsistentRead: true,
      });
      const pendingSwapsData = await client.send(pendingSwapsCommand);
      const pendingSwaps: Swap[] = (pendingSwapsData.Items || []).map((item) => ({
        user: item.user.S!,
        fromCourseId: Number(item.fromCourseId.S!),
        fromDate: item.fromDate.S!,
        toCourseId: Number(item.toCourseId.S!),
        toDate: item.toDate.S!,
        status: item.status.S as Swap["status"],
      }));

      // 2) Alle Overrides laden (zukünftige Termine)
      const overridesCommand = new ScanCommand({
        TableName: process.env.OVERRIDES_TABLE,
        ConsistentRead: true,
      });
      const overridesData = await client.send(overridesCommand);
      const allOverrides: CourseDateOverride[] = (overridesData.Items || []).map((item) => ({
        courseId: Number(item.courseId.S!),
        date: item.date.S!,
        participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
        swapped: item.swapped.L ? item.swapped.L.map((s: any) => s.S) : [],
        waitlist: item.waitlist.L ? item.waitlist.L.map((w: any) => w.S) : [],
      }));
      const futureOverrides = allOverrides.filter((o) => new Date(o.date) >= new Date());

      // 3) Alle Courses laden (Scan, da klein)
      const coursesCommand = new ScanCommand({
        TableName: process.env.COURSES_TABLE,
        ConsistentRead: true,
      });
      const coursesData = await client.send(coursesCommand);
      const courses: Course[] = (coursesData.Items || []).map((item) => ({
        id: Number(item.id.N!),
        name: item.name.S!,
        weekday: item.weekday.S!,
        time: item.time.S!,
        capacity: Number(item.capacity.N!),
        participants: item.participants.L ? item.participants.L.map((p: any) => p.S) : [],
        dates: item.dates.L ? item.dates.L.map((d: any) => d.S) : [],
      }));

      // 4) Durchsuche Overrides nach freien Plätzen mit Warteliste
      for (const override of futureOverrides) {
        const overrideCourse = courses.find((c) => c.id === override.courseId);
        if (!overrideCourse) continue;

        const freeSpots = overrideCourse.capacity - override.participants.length;
        if (freeSpots <= 0) continue;

        // Nimm den ersten User aus der Warteliste
        const promotedUser = override.waitlist?.[0];
        if (!promotedUser) continue;

        const correspondingSwap = pendingSwaps.find(
          (s) => s.user === promotedUser && s.toCourseId === override.courseId && s.toDate === override.date
        );
        if (!correspondingSwap) continue;

        changed = true;
        promotedSwaps.push(correspondingSwap);

        // 5) Swap auf 'active' setzen (UpdateItemCommand)
        const swapId = `${correspondingSwap.fromDate}_${correspondingSwap.fromCourseId}_${correspondingSwap.toDate}_${correspondingSwap.toCourseId}`;
        const updateSwapCommand = new UpdateItemCommand({
          TableName: process.env.SWAPS_TABLE,
          Key: {
            swapId: { S: swapId },
            user: { S: promotedUser },
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

        // 6) Ziel-Override aktualisieren (UpdateItemCommand)
        const newParticipants = [...override.participants, promotedUser];
        const newWaitlist = override.waitlist?.slice(1);
        await updateOverrideHelper(override.courseId, override.date, {
          participants: newParticipants,
          waitlist: newWaitlist,
        });

        // 7) Ursprung-Override bereinigen
        const originOverride = allOverrides.find(
          (o) => o.courseId === correspondingSwap.fromCourseId && o.date === correspondingSwap.fromDate
        );
        if (originOverride) {
          const newOriginParticipants = originOverride.participants.filter((p) => p !== promotedUser);
          const newOriginSwapped = (originOverride.swapped ?? []).filter((p) => p !== promotedUser);
          const newOriginWaitlist = (originOverride.waitlist ?? []).filter((u) => u !== promotedUser);
          await updateOverrideHelper(correspondingSwap.fromCourseId, correspondingSwap.fromDate, {
            participants: newOriginParticipants,
            swapped: newOriginSwapped,
            waitlist: newOriginWaitlist,
          });
        } else {
          const originCourse = courses.find((c) => c.id === correspondingSwap.fromCourseId);
          if (originCourse) {
            const newOriginOverride: CourseDateOverride = {
              courseId: correspondingSwap.fromCourseId,
              date: correspondingSwap.fromDate,
              participants: originCourse.participants.filter((p) => p !== promotedUser),
              swapped: [],
              waitlist: [],
            };
            await createOverrideHelper(newOriginOverride);
          }
        }

        // 8) Alle anderen pending Swaps des Users vom Ursprungstermin stornieren
        const pendingOriginSwaps = pendingSwaps.filter(
          (s) => s.user === promotedUser && s.fromCourseId === correspondingSwap.fromCourseId && s.fromDate === correspondingSwap.fromDate && s.toCourseId !== correspondingSwap.toCourseId && s.toDate !== correspondingSwap.toDate
        );
        for (const originSwap of pendingOriginSwaps) {
          const originSwapId = `${originSwap.fromDate}_${originSwap.fromCourseId}_${originSwap.toDate}_${originSwap.toCourseId}`;
          const deleteCommand = new DeleteItemCommand({
            TableName: process.env.SWAPS_TABLE,
            Key: {
              swapId: { S: originSwapId },
              user: { S: promotedUser },
            },
          });
          await client.send(deleteCommand);

          // Ziel-Override Warteliste bereinigen
          const targetOriginOverride = allOverrides.find(
            (o) => o.courseId === originSwap.toCourseId && o.date === originSwap.toDate
          );
          if (targetOriginOverride) {
            const newTargetWaitlist = (targetOriginOverride.waitlist || []).filter((u) => u !== promotedUser);
            await updateOverrideHelper(originSwap.toCourseId, originSwap.toDate, {
              waitlist: newTargetWaitlist,
            });
          }

          console.log(`[processPromotions] Storniert pending Swap: ${originSwap.user} von ${originSwap.fromCourseId}/${originSwap.fromDate} → ${originSwap.toCourseId}/${originSwap.toDate}`);
        }

        console.log(`[processPromotions] ${promotedUser} nachgerückt von ${correspondingSwap.fromCourseId}/${correspondingSwap.fromDate} → ${override.courseId}/${override.date}`);
      }

      if (iterations >= maxIterations) {
        console.warn('[processPromotions] Max iterations reached - potential loop detected');
      }
    }

    console.log(`[processPromotions] Complete after ${iterations} iterations`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Promotions processed', iterations, promoted: promotedSwaps.length }) };
  } catch (error) {
    console.error('Error in processPromotions:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
}