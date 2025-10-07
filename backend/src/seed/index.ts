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

(async () => {
  try {
    await seedSwaps("yogaswap-backend-demo-swaps-table", swaps);
    await seedTable("yogaswap-backend-demo-courseOverrides-table", courseDateOverrides);
    await seedTable("yogaswap-backend-demo-courses-table", courses);
    console.log("🎉 Seeding completed!");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
})();
