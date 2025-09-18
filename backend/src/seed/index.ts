// cd backend
// npm run seed


import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { swaps } from "./swaps.js";
import { courseDateOverrides } from "./overrides.js";

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
      fromDate_fromCourseId: { S: `${item.fromDate}#${item.fromCourseId}` }, // ✅ Kombinierter Schlüssel
      fromDate: { S: item.fromDate },
      fromCourseId: { S: item.fromCourseId.toString() },
      toDate: { S: item.toDate },
      toCourseId: { S: item.toCourseId.toString() },
      status: { S: item.status },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    console.log(`✅ Inserted into ${tableName}:`, item);
  }
}

(async () => {
  try {
    await seedSwaps("yogaswap-backend-demo-swaps-table", swaps);
    await seedTable("yogaswap-backend-demo-courseOverrides", courseDateOverrides);
    console.log("🎉 Seeding completed!");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
})();
