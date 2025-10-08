// cd backend
// npm run seed


import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { swaps } from "./swaps";
import { courseDateOverrides } from "./overrides";
import { courses } from "./courses";


const client = new DynamoDBClient({ region: "eu-central-1" });

async function seedTable(tableName: string, items: any[]) {
  for (const item of items) {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: Object.fromEntries(
          Object.entries(item).map(([k, v]) => [
            k,
            { S: typeof v === "string" ? v : JSON.stringify(v) },
          ])
        ),
      })
    );
    console.log(`✅ Inserted into ${tableName}:`, item);
  }
}

async function seedSwaps(tableName: string, items: any[]) {
  for (const item of items) {
    const dynamoItem: Record<string, { S: string }> = {
      user: { S: item.user },
      swapId: { S: `${item.fromDate}_${item.fromCourseId}_${item.toDate}_${item.toCourseId}` }, // eindeutiger Range Key
      fromDate: { S: item.fromDate },
      fromCourseId: { S: item.fromCourseId.toString() },
      toDate: { S: item.toDate },
      toCourseId: { S: item.toCourseId.toString() },
      status: { S: item.status },

      // zusammengesetzte Keys für GSIs
      fromDate_fromCourseId_status: { S: `${item.fromDate}_${item.fromCourseId}_${item.status}` },
      toDate_toCourseId_status: { S: `${item.toDate}_${item.toCourseId}_${item.status}` },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    console.log(`✅ Inserted into ${tableName}:`, item);
  }
}

// Seed-Funktion für Courses-Tabelle
async function seedCourses(tableName: string, items: any[]) {
  for (const item of items) {
    if (!item.id || !item.name || !item.weekday || !item.time || !item.capacity || !item.dates) {
      console.warn(`⚠️ Skipping invalid course item:`, item);
      continue;
    }
    const dynamoItem: Record<string, any> = {
      id: { N: item.id.toString() },
      name: { S: item.name },
      weekday: { S: item.weekday },
      time: { S: item.time },
      capacity: { N: item.capacity.toString() },
      dates: { L: (item.dates || []).map((d: string) => ({ S: d })) },
      participants: { L: (item.participants || []).map((p: string) => ({ S: p })) },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    console.log(`✅ Inserted into ${tableName}:`, item);
  }
}

// Seed-Funktion für CourseOverrides-Tabelle
async function seedOverrides(tableName: string, items: any[]) {
  for (const item of items) {
    if (!item.courseId || !item.date) {
      console.warn(`⚠️ Skipping invalid override item:`, item);
      continue;
    }
    const dynamoItem: Record<string, any> = {
      courseId: { S: item.courseId.toString() },
      date: { S: item.date },
      participants: { L: (item.participants || []).map((p: string) => ({ S: p })) },
      swapped: { L: (item.swapped || []).map((s: string) => ({ S: s })) },
      waitlist: { L: (item.waitlist || []).map((w: string) => ({ S: w })) },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    console.log(`✅ Inserted into ${tableName}:`, item);
  }
}

(async () => {
  try {
    await seedSwaps("yogaswap-backend-demo-swaps-table", swaps);
    await seedOverrides("yogaswap-backend-demo-courseOverrides-table", courseDateOverrides);
    await seedCourses("yogaswap-backend-demo-courses-table", courses);
    console.log("🎉 Seeding completed!");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
})();
