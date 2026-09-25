import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { Tenant } from "@yogaswap/shared";

/** Öffentlicher Studio-Kontakt für Mails (#272) — Alias/Gruppenpostfach erlaubt. */
export type StudioContact = {
  email: string;
  /** Anzeigename: contactName, sonst Tenant-Name. */
  name?: string;
};

export type StudioMailContext = {
  studioName?: string;
  studioContact?: StudioContact;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Studio-Name + Kontakt aus Tenant-Settings in einem GetItem.
 * Fehlt contactEmail → kein Kontakthinweis. Fehler → leerer Kontext (Mail nicht blockieren).
 */
export async function loadStudioMailContext(
  client: DynamoDBClient,
  tenantsTable: string | undefined,
  tenantId: string,
): Promise<StudioMailContext> {
  if (!tenantsTable?.trim() || !tenantId.trim()) return {};
  try {
    const resp = await client.send(
      new GetItemCommand({
        TableName: tenantsTable,
        Key: { tenantId: { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    if (!resp?.Item) return {};
    const tenant = unmarshall(resp.Item) as Tenant;
    const studioName = tenant.name?.trim() || undefined;
    const email = tenant.settings?.contactEmail?.trim();
    if (!email) {
      return { studioName };
    }
    const contactName = tenant.settings?.contactName?.trim();
    return {
      studioName,
      studioContact: {
        email,
        name: contactName || studioName,
      },
    };
  } catch (err) {
    console.warn("Could not load studio mail context:", err);
    return {};
  }
}

/** HTML-Zeile ohne mailto-Links (Spam-Filter, wie Auth-Footer). */
export function formatStudioContactHtml(contact?: StudioContact | null): string | null {
  const email = contact?.email?.trim();
  if (!email) return null;
  const label = contact?.name?.trim();
  if (label) {
    return `Bei Fragen wende Dich an Dein Studio: <strong>${escapeHtml(label)}</strong> (${escapeHtml(email)})`;
  }
  return `Bei Fragen wende Dich an Dein Studio: ${escapeHtml(email)}`;
}

export function formatStudioContactText(contact?: StudioContact | null): string | null {
  const email = contact?.email?.trim();
  if (!email) return null;
  const label = contact?.name?.trim();
  if (label) {
    return `Bei Fragen wende Dich an Dein Studio: ${label} (${email})`;
  }
  return `Bei Fragen wende Dich an Dein Studio: ${email}`;
}
