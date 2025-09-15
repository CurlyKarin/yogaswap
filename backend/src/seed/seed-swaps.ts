import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { Swap, CourseDateOverride } from "../../../shared/types.js";
//import swaps from "./seed_swaps.json";

const client = new DynamoDBClient({ region: "eu-central-1" });

// async function seed() {
//   for (const swap of swaps) {
//     const cmd = new PutItemCommand({
//       TableName: "swaps",
//       Item: {
//         user: { S: swap.user },
//         fromDate_fromCourseId: { S: swap.fromDate_fromCourseId },
//         toCourseId: { N: swap.toCourseId.toString() },
//         toDate: { S: swap.toDate },
//         status: { S: swap.status }
//       }
//     });
//     await client.send(cmd);
//     console.log(`Inserted swap for ${swap.user}`);
//   }
// }

// seed().catch(console.error);

// Hinweis: Du kannst später npm run seed einrichten, das diesen Script ausführt.
// Demo-Daten
const courseDateOverrides: CourseDateOverride[] = [
  { courseId: 1, date: "2025-09-22", participants: ["Nova","Luna","Skye","Zoe","Aria","Rue","Kai","Nia"], swapped: ["Kai"], waitlist: [] },
  { courseId: 6, date: "2025-09-18", participants: ["Aria","Rue","Skye"], swapped: ["Skye"], waitlist: ["Kai","Nia"] },
  { courseId: 4, date: "2025-09-17", participants: ["Luna","Skye"], swapped: [], waitlist: ["Nia"] },
];

const swaps: Swap[] = [
  { user: "Nia", fromCourseId: 5, fromDate: "2025-09-18", toCourseId: 4, toDate: "2025-09-17", status: "pending" },
  { user: "Nia", fromCourseId: 5, fromDate: "2025-09-18", toCourseId: 6, toDate: "2025-09-18", status: "pending" },
];

async function seedTable(tableName: string, items: any[]) {
  for (const item of items) {
    await client.send(new PutItemCommand({
      TableName: tableName,
      Item: Object.fromEntries(
        Object.entries(item).map(([k, v]) => [k, { S: typeof v === "string" ? v : JSON.stringify(v) }])
      )
    }));
    console.log(`Inserted item into ${tableName}:`, item);
  }
}
