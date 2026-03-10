import {
  DynamoDBClient,
  DescribeTableCommand,
  PutItemCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import type { TenantSettings } from "@yogaswap/shared";
import path from "node:path";
import fs from "node:fs";

function resolveProjectName(): string {
  if (process.env.PROJECT_NAME) {
    return process.env.PROJECT_NAME;
  }

  const tfvarsPath = path.resolve(
    __dirname,
    "../../../projects/yogaswap/terraform.tfvars",
  );
  try {
    if (fs.existsSync(tfvarsPath)) {
      const tfvarsContent = fs.readFileSync(tfvarsPath, "utf-8");
      const lines = tfvarsContent.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("#")) continue;
        const match = trimmedLine.match(/^project\s*=\s*"([^"]+)"/);
        if (match?.[1]) {
          console.log(
            `ℹ️  PROJECT_NAME aus terraform.tfvars geladen: ${match[1]}`,
          );
          return match[1];
        }
      }
    }
  } catch (err) {
    console.warn("⚠️  Konnte terraform.tfvars nicht lesen:", err);
  }

  return "yogaswap-backend-demo";
}

const PROJECT_NAME = resolveProjectName();
const DEFAULT_TENANT_ID = "default-tenant";
const TENANTS_TABLE =
  process.env.TENANTS_TABLE || `${PROJECT_NAME}-tenants-table`;
const AWS_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-central-1";

const client = new DynamoDBClient({ region: AWS_REGION });

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (
      error instanceof ResourceNotFoundException ||
      (error as any)?.name === "ResourceNotFoundException" ||
      (error as any)?.__type ===
        "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException"
    ) {
      return false;
    }
    throw error;
  }
}

async function seedDefaultTenant() {
  console.log("🌱 Seede Tenants-Tabelle...");
  console.log(`   AWS Region: ${AWS_REGION}`);
  console.log(`   Project Name: ${PROJECT_NAME}`);
  console.log(`   Tenants Table: ${TENANTS_TABLE}`);
  console.log("");

  const exists = await tableExists(TENANTS_TABLE);
  if (!exists) {
    console.error(`❌ Tenants Table "${TENANTS_TABLE}" existiert nicht.`);
    console.error(
      "   Erstelle die Tabelle zuerst mit Terraform (module.tenants_table).",
    );
    process.exit(1);
  }

  const settings: TenantSettings = {
    instructorCanSeeAllCourses: true,
    instructorCanInviteParticipants: true,
    participantsSeeOnlyOwnInstructors: false,
  };

  const item = {
    tenantId: DEFAULT_TENANT_ID,
    name: "YogaSwap Demo Studio",
    settings,
  };

  await client.send(
    new PutItemCommand({
      TableName: TENANTS_TABLE,
      Item: marshall(item, { removeUndefinedValues: true }),
    }),
  );

  console.log(
    `✅ Default-Tenant "${DEFAULT_TENANT_ID}" in ${TENANTS_TABLE} gespeichert.`,
  );
}

seedDefaultTenant().catch((err) => {
  console.error("❌ Seeding Tenants failed:", err);
  process.exit(1);
});

