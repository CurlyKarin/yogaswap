// backend/src/scripts/create_tenant.ts
//
// Legt einen Tenant an und verknüpft einen BEREITS EXISTIERENDEN Admin-User
// per UserTenantMembership (role=admin) – idempotent (#53).
//
// Cognito-User wird hier NICHT angelegt (das macht createAdminUser.js bzw.
// scripts/bootstrap-admin.sh). Weitere Konfiguration (Kurse, Teilnehmer:innen,
// Einstellungen) erfolgt wie gewohnt über die UI.
//
// Aufruf:
//   PROJECT_NAME="<project>" npm run create-tenant -- \
//     --tenant <tenantId> --admin-nickname <nickname> [--name "<Anzeigename>"] \
//     [--role <role>] [--skip-participant-profile]
//
// Die Zielumgebung MUSS explizit gesetzt sein (kein Demo-Fallback, #74) – über
// PROJECT_NAME, projects/yogaswap/terraform.tfvars oder direkt
// TENANTS_TABLE/MEMBERSHIPS_TABLE/PARTICIPANTS_TABLE.

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

interface CliArgs {
  tenant?: string;
  name?: string;
  adminNickname?: string;
  role: string;
  withParticipantProfile: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  // Profil standardmäßig an: sonst erscheint der Admin nicht in der
  // Teilnehmerliste und kann dort nicht als User verwaltet werden (#261).
  const args: CliArgs = { role: "admin", withParticipantProfile: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--tenant":
        args.tenant = argv[++i];
        break;
      case "--name":
        args.name = argv[++i];
        break;
      case "--admin-nickname":
        args.adminNickname = argv[++i];
        break;
      case "--role":
        args.role = argv[++i];
        break;
      case "--with-participant-profile":
        args.withParticipantProfile = true;
        break;
      case "--skip-participant-profile":
        args.withParticipantProfile = false;
        break;
      default:
        console.warn(`⚠️  Unbekanntes Argument ignoriert: ${arg}`);
    }
  }
  return args;
}

function usage(): never {
  console.error(
    [
      "Verwendung:",
      "  npm run create-tenant -- --tenant <tenantId> --admin-nickname <nickname> \\",
      '    [--name "<Anzeigename>"] [--role admin] [--skip-participant-profile]',
      "",
      "Zielumgebung explizit setzen, z. B.:",
      '  PROJECT_NAME="<project>" npm run create-tenant -- --tenant studio-x --admin-nickname karin',
    ].join("\n"),
  );
  process.exit(1);
}

function resolveProjectName(): string | undefined {
  if (process.env.PROJECT_NAME) return process.env.PROJECT_NAME;

  const tfvarsPath = path.resolve(
    __dirname,
    "../../../projects/yogaswap/terraform.tfvars",
  );
  try {
    if (fs.existsSync(tfvarsPath)) {
      const lines = fs.readFileSync(tfvarsPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^project\s*=\s*"([^"]+)"/);
        if (match?.[1]) {
          console.log(`ℹ️  PROJECT_NAME aus terraform.tfvars geladen: ${match[1]}`);
          return match[1];
        }
      }
    }
  } catch (err) {
    console.warn("⚠️  Konnte terraform.tfvars nicht lesen:", err);
  }

  // Bewusst kein Demo-Fallback (siehe #74).
  return undefined;
}

const PROJECT_NAME = resolveProjectName();

function resolveTable(directEnv: string | undefined, suffix: string): string {
  if (directEnv) return directEnv;
  if (PROJECT_NAME) return `${PROJECT_NAME}-${suffix}`;
  console.error(
    [
      `❌ Zielumgebung nicht bestimmbar: weder ${suffix.toUpperCase()} noch PROJECT_NAME gesetzt`,
      "   (und kein project in projects/yogaswap/terraform.tfvars gefunden).",
      "",
      "   Setze die Umgebung explizit, z. B.:",
      '     PROJECT_NAME="<project>" npm run create-tenant -- --tenant ... --admin-nickname ...',
    ].join("\n"),
  );
  process.exit(1);
}

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
      (error as { name?: string })?.name === "ResourceNotFoundException"
    ) {
      return false;
    }
    throw error;
  }
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    (error as { name?: string })?.name === "ConditionalCheckFailedException"
  );
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant || !args.adminNickname) usage();

  const tenantId = args.tenant;
  const adminNickname = args.adminNickname;
  const tenantName = args.name || tenantId;

  const TENANTS_TABLE = resolveTable(process.env.TENANTS_TABLE, "tenants-table");
  const MEMBERSHIPS_TABLE = resolveTable(
    process.env.MEMBERSHIPS_TABLE,
    "memberships-table",
  );
  const PARTICIPANTS_TABLE = args.withParticipantProfile
    ? resolveTable(process.env.PARTICIPANTS_TABLE, "participants-table")
    : undefined;

  console.log("🏛️  create-tenant");
  console.log(`   Region:        ${AWS_REGION}`);
  console.log(`   Project:       ${PROJECT_NAME ?? "(via Tabellen-Variablen)"}`);
  console.log(`   Tenant:        ${tenantId} ("${tenantName}")`);
  console.log(`   Admin:         ${adminNickname} (role=${args.role})`);
  console.log(`   Tenants Table: ${TENANTS_TABLE}`);
  console.log(`   Members Table: ${MEMBERSHIPS_TABLE}`);
  if (PARTICIPANTS_TABLE) console.log(`   Profile Table: ${PARTICIPANTS_TABLE}`);
  console.log("");

  for (const table of [
    TENANTS_TABLE,
    MEMBERSHIPS_TABLE,
    ...(PARTICIPANTS_TABLE ? [PARTICIPANTS_TABLE] : []),
  ]) {
    if (!(await tableExists(table))) {
      console.error(`❌ Tabelle "${table}" existiert nicht.`);
      console.error("   Lege die Umgebung zuerst mit Terraform an (tofu apply).");
      process.exit(1);
    }
  }

  // 1. Tenant anlegen – nur falls noch nicht vorhanden (UI-Settings nicht überschreiben).
  const settings: TenantSettings = {
    instructorCanSeeAllCourses: true,
    instructorCanInviteParticipants: true,
    participantsSeeOnlyOwnInstructors: false,
  };
  try {
    await client.send(
      new PutItemCommand({
        TableName: TENANTS_TABLE,
        Item: marshall(
          { tenantId, name: tenantName, settings },
          { removeUndefinedValues: true },
        ),
        ConditionExpression: "attribute_not_exists(tenantId)",
      }),
    );
    console.log(`✅ Tenant "${tenantId}" angelegt.`);
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      console.log(`ℹ️  Tenant "${tenantId}" existiert bereits – unverändert gelassen.`);
    } else {
      throw error;
    }
  }

  // 2. Membership (Upsert) – verknüpft den bestehenden Admin mit dem Tenant.
  await client.send(
    new PutItemCommand({
      TableName: MEMBERSHIPS_TABLE,
      Item: marshall({ tenantId, userId: adminNickname, role: args.role }),
    }),
  );
  console.log(
    `✅ Membership gesetzt: ${adminNickname} → ${tenantId} (role=${args.role}).`,
  );

  // 3. Participant-Profil (Standard): ohne Profil erscheint der Admin nicht in
  //    der Teilnehmerliste. Abschalten mit --skip-participant-profile.
  if (PARTICIPANTS_TABLE) {
    try {
      await client.send(
        new PutItemCommand({
          TableName: PARTICIPANTS_TABLE,
          Item: marshall({
            tenantId,
            userId: adminNickname,
            userIdNormalized: adminNickname.toLowerCase(),
          }),
          ConditionExpression:
            "attribute_not_exists(tenantId) AND attribute_not_exists(userId)",
        }),
      );
      console.log(`✅ Participant-Profil für ${adminNickname} angelegt.`);
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        console.log(`ℹ️  Participant-Profil für ${adminNickname} existiert bereits.`);
      } else {
        throw error;
      }
    }
  }

  console.log("");
  console.log("🎉 Fertig.");
}

run().catch((err) => {
  console.error("❌ create-tenant fehlgeschlagen:", err);
  process.exit(1);
});
