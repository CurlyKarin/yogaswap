// cd backend
// npm run seed
//
// Die Zielumgebung MUSS explizit gesetzt werden (kein Demo-Fallback, siehe #74):
//
// Option 1: Mit PROJECT_NAME (empfohlen - Tabellennamen werden automatisch gebildet)
// PROJECT_NAME="<PROJECT_NAME>" npm run seed
//
// Option 2: Tabellennamen direkt setzen
// SWAPS_TABLE="<PROJECT_NAME>-swaps-table" \
// OVERRIDES_TABLE="<PROJECT_NAME>-courseOverrides-table" \
// COURSES_TABLE="<PROJECT_NAME>-courses-table" \
// COURSE_ENROLLMENTS_TABLE="<PROJECT_NAME>-courseEnrollments-table" \
// npm run seed
//
// Alternativ wird der Projektname aus projects/yogaswap/terraform.tfvars gelesen,
// falls vorhanden.

import { DynamoDBClient, PutItemCommand, DescribeTableCommand, ResourceNotFoundException, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { migrateParticipantsToEnrollments } from "@yogaswap/shared";
import { enrollmentToDynamoItem } from "../lambdas/shared/courseEnrollmentDynamo";
import { swaps } from "./swaps";
import { courseDateOverrides } from "./overrides";
import { courses } from "./courses";
import { generateCourseUid } from "../lambdas/shared/courseUid";

import path from "node:path";
import fs from "node:fs";

function resolveProjectName(): string | undefined {
  if (process.env.PROJECT_NAME) {
    return process.env.PROJECT_NAME;
  }

  // Versuche den Projektnamen aus projects/yogaswap/terraform.tfvars zu lesen
  const tfvarsPath = path.resolve(__dirname, "../../../projects/yogaswap/terraform.tfvars");
  try {
    if (fs.existsSync(tfvarsPath)) {
      const tfvarsContent = fs.readFileSync(tfvarsPath, "utf-8");
      
      // Suche nach project = "..." in Zeilen, die NICHT mit # beginnen
      // Berücksichtige auch Fälle wo # nach Leerzeichen/Tabs kommt
      const lines = tfvarsContent.split("\n");
      for (const line of lines) {
        // Entferne führende Leerzeichen und prüfe ob Zeile mit # beginnt (Kommentar)
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("#")) {
          continue; // Kommentarzeile überspringen
        }
        
        // Suche nach project = "..." in dieser Zeile
        const match = trimmedLine.match(/^project\s*=\s*"([^"]+)"/);
        if (match?.[1]) {
          console.log(`ℹ️  PROJECT_NAME aus terraform.tfvars geladen: ${match[1]}`);
          return match[1];
        }
      }
    }
  } catch (err) {
    console.warn("⚠️  Konnte terraform.tfvars nicht lesen:", err);
  }

  // Bewusst kein Demo-Fallback: lieber Fail-fast als versehentlich die
  // falsche Umgebung anfassen (siehe #74).
  return undefined;
}

// Tabellennamen aus Environment-Variablen oder terraform.tfvars
// Format: {project}-{table-type}-table
const PROJECT_NAME = resolveProjectName();

function resolveTable(directEnv: string | undefined, suffix: string): string {
  if (directEnv) return directEnv;
  if (PROJECT_NAME) return `${PROJECT_NAME}-${suffix}`;
  console.error(
    [
      "❌ Zielumgebung nicht bestimmbar: weder Tabellen-Variablen noch PROJECT_NAME gesetzt",
      "   (und kein project in projects/yogaswap/terraform.tfvars gefunden).",
      "",
      "   Setze die Umgebung explizit, z. B.:",
      '     PROJECT_NAME="<project>" npm run seed',
      '     SWAPS_TABLE="<project>-swaps-table" OVERRIDES_TABLE="..." COURSES_TABLE="..." npm run seed',
    ].join("\n"),
  );
  process.exit(1);
}

const SWAPS_TABLE = resolveTable(process.env.SWAPS_TABLE, "swaps-table");
const OVERRIDES_TABLE = resolveTable(process.env.OVERRIDES_TABLE, "courseOverrides-table");
const COURSES_TABLE = resolveTable(process.env.COURSES_TABLE, "courses-table");
const COURSE_ENROLLMENTS_TABLE = resolveTable(
  process.env.COURSE_ENROLLMENTS_TABLE,
  "courseEnrollments-table",
);
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-central-1";

const DEFAULT_TENANT_ID = "default-tenant";

const client = new DynamoDBClient({ region: AWS_REGION });

// Prüfe ob eine Tabelle existiert
async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException || 
        (error as any)?.name === "ResourceNotFoundException" ||
        (error as any)?.__type === "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException") {
      return false;
    }
    throw error;
  }
}

// Liste alle Tabellen auf, die zum Projekt passen könnten
async function listSimilarTables(_prefix: string): Promise<string[]> {
  try {
    const result = await client.send(new ListTablesCommand({}));
    const allTables = result.TableNames || [];
    // Filtere Tabellen, die yogaswap enthalten
    return allTables.filter(tableName => 
      tableName.toLowerCase().includes('yogaswap')
    );
  } catch (error) {
    console.warn("⚠️  Konnte Tabellen-Liste nicht abrufen:", error);
    return [];
  }
}

// Versuche passende Tabellen basierend auf Typ zu finden
async function findMatchingTables(
  missingTableType: string, 
  similarTables: string[]
): Promise<string[]> {
  const patterns: Record<string, string[]> = {
    "swaps": ["swap"],
    "courseOverrides": ["override", "course"],
    "courses": ["course"],
    "courseEnrollments": ["enrollment"],
  };
  
  const patternsForType = patterns[missingTableType.toLowerCase()] || [missingTableType.toLowerCase()];
  
  return similarTables.filter(tableName => {
    const lowerTable = tableName.toLowerCase();
    return patternsForType.some(pattern => lowerTable.includes(pattern));
  });
}

// Prüfe alle Tabellen vor dem Seeding
async function checkTablesExist(): Promise<void> {
  const tables = [
    { name: SWAPS_TABLE, type: "Swaps", expected: "swaps-table" },
    { name: OVERRIDES_TABLE, type: "Course Overrides", expected: "courseOverrides-table" },
    { name: COURSES_TABLE, type: "Courses", expected: "courses-table" },
    { name: COURSE_ENROLLMENTS_TABLE, type: "Course Enrollments", expected: "courseEnrollments-table" },
  ];

  const missingTables: Array<{ name: string; type: string; expected: string }> = [];

  for (const table of tables) {
    const exists = await tableExists(table.name);
    if (!exists) {
      missingTables.push(table);
      console.log(`❌ ${table.type} Table "${table.name}" existiert nicht`);
    } else {
      console.log(`✅ ${table.type} Table "${table.name}" existiert`);
    }
  }

  if (missingTables.length > 0) {
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("❌ Fehler: Die folgenden Tabellen wurden nicht gefunden:");
    console.log("");
    
    for (const table of missingTables) {
      console.log(`   - ${table.name}`);
    }
    
    console.log("");
    console.log("🔍 Suche nach ähnlichen Tabellen...");
    
    // Versuche ähnliche Tabellen zu finden
    const projectPrefix = (PROJECT_NAME ?? "").split('-').slice(0, 2).join('-');
    const similarTables = await listSimilarTables(projectPrefix);
    
    if (similarTables.length > 0) {
      console.log("");
      console.log("💡 Gefundene Tabellen in AWS:");
      for (const table of similarTables) {
        console.log(`   - ${table}`);
      }
      console.log("");
      console.log("⚠️  Die Tabellennamen stimmen nicht überein!");
      console.log("");
      
      // Versuche passende Tabellen zu finden
      const suggestedTables: Record<string, string> = {};
      for (const missing of missingTables) {
        const matching = await findMatchingTables(missing.expected.replace("-table", ""), similarTables);
        if (matching.length > 0) {
          suggestedTables[missing.name] = matching[0];
        }
      }
      
      if (Object.keys(suggestedTables).length > 0) {
        console.log("💡 Vorschlag - Diese Tabellen passen zu deinen erwarteten Tabellen:");
        console.log("");
        for (const [expected, found] of Object.entries(suggestedTables)) {
          console.log(`   Erwartet: ${expected}`);
          console.log(`   Gefunden: ${found}`);
          console.log("");
        }
        console.log("   Verwende diese Tabellennamen:");
        console.log("");
        
        const swapsTable = suggestedTables[SWAPS_TABLE] || SWAPS_TABLE;
        const overridesTable = suggestedTables[OVERRIDES_TABLE] || OVERRIDES_TABLE;
        const coursesTable = suggestedTables[COURSES_TABLE] || COURSES_TABLE;
        
        console.log(`   SWAPS_TABLE="${swapsTable}" \\`);
        console.log(`   OVERRIDES_TABLE="${overridesTable}" \\`);
        console.log(`   COURSES_TABLE="${coursesTable}" \\`);
        console.log(`   npm run seed`);
      } else {
        console.log("💡 Mögliche Lösungen:");
        console.log("");
        console.log("   1. Tabellennamen direkt setzen (basierend auf den gefundenen Tabellen):");
        console.log(`      SWAPS_TABLE="<name-aus-liste>" \\`);
        console.log(`      OVERRIDES_TABLE="<name-aus-liste>" \\`);
        console.log(`      COURSES_TABLE="<name-aus-liste>" \\`);
        console.log(`      npm run seed`);
        console.log("");
      }
      
      console.log("");
      console.log("   2. Oder PROJECT_NAME anpassen:");
      console.log("      PROJECT_NAME=\"<PROJECT_NAME>\" npm run seed");
      console.log("");
      console.log("   3. Oder terraform.tfvars aktualisieren mit dem korrekten Projektnamen")
    } else {
      console.log("   Keine ähnlichen Tabellen gefunden.");
      console.log("");
      console.log("💡 Lösung: Erstelle die Tabellen zuerst mit Terraform:");
      console.log("");
      console.log("   cd projects/yogaswap");
      console.log("   tofu apply -target=module.swaps_table -target=module.course_overrides_table -target=module.courses_table");
    }
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    process.exit(1);
  }
}

async function seedSwaps(tableName: string, items: any[]) {
  for (const item of items) {
    const swapId = `${item.fromDate}_${item.fromCourseId}_${item.toDate}_${item.toCourseId}`;
    const user_swapId = `${item.user}#${swapId}`;
    const tenantId_user = `${DEFAULT_TENANT_ID}#${item.user}`;
    const dynamoItem: Record<string, any> = {
      tenantId: { S: DEFAULT_TENANT_ID },
      user_swapId: { S: user_swapId },
      user: { S: item.user },
      swapId: { S: swapId },
      fromDate: { S: item.fromDate },
      fromCourseId: { S: item.fromCourseId.toString() },
      toDate: { S: item.toDate },
      toCourseId: { S: item.toCourseId.toString() },
      status: { S: item.status },
      fromDate_fromCourseId_status: { S: `${item.fromDate}_${item.fromCourseId}_${item.status}` },
      toDate_toCourseId_status: { S: `${item.toDate}_${item.toCourseId}_${item.status}` },
      tenantId_user: { S: tenantId_user },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    console.log(`✅ Inserted into ${tableName}:`, item);
  }
}

// Seed-Funktion für Courses-Tabelle (tenant-scoped: tenantId + courseId)
async function seedCourses(tableName: string, items: any[]) {
  for (const item of items) {
    if (!item.id || !item.name || !item.weekday || !item.time || !item.capacity || !item.dates) {
      console.warn(`⚠️ Skipping invalid course item:`, item);
      continue;
    }
    const courseId = item.id.toString();
    const dynamoItem: Record<string, any> = {
      tenantId: { S: DEFAULT_TENANT_ID },
      courseId: { S: courseId },
      courseUid: { S: generateCourseUid() },
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

async function seedCourseEnrollmentsFromCourses(tableName: string, courseItems: any[]) {
  const createdAt = new Date().toISOString();
  for (const item of courseItems) {
    if (!item?.id) continue;
    const enrollments = migrateParticipantsToEnrollments(
      {
        id: item.id,
        tenantId: DEFAULT_TENANT_ID,
        participants: item.participants ?? [],
        seriesStartDate: item.seriesStartDate,
        visibleFrom: item.visibleFrom,
      },
      { source: "seed", createdAt },
    );
    for (const enrollment of enrollments) {
      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: enrollmentToDynamoItem(enrollment, DEFAULT_TENANT_ID),
        }),
      );
      console.log(`✅ Inserted enrollment into ${tableName}:`, {
        courseId: enrollment.courseId,
        userId: enrollment.participantId,
        validFrom: enrollment.validFrom,
      });
    }
  }
}

// Seed-Funktion für CourseOverrides-Tabelle (tenant-scoped: tenantId + courseId_date)
async function seedOverrides(tableName: string, items: any[]) {
  for (const item of items) {
    if (!item.courseId || !item.date) {
      console.warn(`⚠️ Skipping invalid override item:`, item);
      continue;
    }
    const courseId_date = `${item.courseId}_${item.date}`;
    const dynamoItem: Record<string, any> = {
      tenantId: { S: DEFAULT_TENANT_ID },
      courseId_date: { S: courseId_date },
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
    console.log("🌱 Starting seed process...");
    console.log(`   AWS Region: ${AWS_REGION}`);
    console.log(`   Project Name: ${PROJECT_NAME ?? "(via Tabellen-Variablen)"}`);
    console.log(`   Swaps Table: ${SWAPS_TABLE}`);
    console.log(`   Overrides Table: ${OVERRIDES_TABLE}`);
    console.log(`   Courses Table: ${COURSES_TABLE}`);
    console.log(`   Course Enrollments Table: ${COURSE_ENROLLMENTS_TABLE}`);
    console.log("");
    console.log("🔍 Prüfe ob Tabellen existieren...");
    console.log("");

    // Prüfe zuerst, ob alle Tabellen existieren
    await checkTablesExist();
    
    console.log("");
    console.log("📝 Starte Seeding...");
    console.log("");

    await seedSwaps(SWAPS_TABLE, swaps);
    await seedOverrides(OVERRIDES_TABLE, courseDateOverrides);
    await seedCourses(COURSES_TABLE, courses);
    await seedCourseEnrollmentsFromCourses(COURSE_ENROLLMENTS_TABLE, courses);
    
    console.log("");
    console.log("🎉 Seeding completed!");
  } catch (err) {
    // Wenn es ein ResourceNotFoundException ist, geben wir eine hilfreiche Meldung aus
    if (err instanceof ResourceNotFoundException || 
        (err as any)?.__type === "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException") {
      console.error("");
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("❌ Fehler: DynamoDB-Tabelle wurde nicht gefunden!");
      console.error("");
      console.error("💡 Die Tabellen müssen zuerst mit Terraform erstellt werden:");
      console.error("");
      console.error("   cd projects/yogaswap");
      console.error("   tofu apply -target=module.swaps_table -target=module.course_overrides_table -target=module.courses_table -target=module.course_enrollments_table");
      console.error("");
      console.error("   Siehe auch: projects/yogaswap/DEPLOYMENT_STEPS.md");
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } else {
    console.error("❌ Seeding failed:", err);
    }
    process.exit(1);
  }
})();
