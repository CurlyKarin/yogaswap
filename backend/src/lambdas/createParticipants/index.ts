import {
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetItemCommand, PutItemCommand, QueryCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  generateParticipantId,
  getParticipantStatus,
  validateDisplayName,
  validateNickname,
} from "@yogaswap/shared";
import crypto from "crypto";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";
import { resolveAppBaseUrlForTenant } from "../shared/appBaseUrl";
import { buildInviteMail, buildReactivationMail, toSesAuthMessage } from "../shared/templates/auth/authMailTemplates";
import { resolveSesSourceEmail } from "../shared/notifications/sesFromAddress";
import { loadStudioMailContext, type StudioContact } from "../shared/studioContact";
import {
  generateOpaqueCognitoUsername,
  listCognitoUsersByEmail,
  resolveCognitoUsernameAndSub,
} from "../shared/cognitoUserIdentity";
import { hasCompletedInviteForPoolUser } from "../shared/deleteIncompleteCognitoUser";
import { resolveAuthTokenTtlSeconds } from "../shared/authTokenTtl";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});
const dynamodb = dynamoClient;

const DEFAULT_TENANT_ID = "default-tenant";
const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";

type ParticipantProfileFields = {
  userId: string;
  authUserId?: string;
  cognitoUsername?: string;
  email?: string;
  participantId?: string;
  displayName?: string;
  inviteCompletedAt?: string;
  inviteSentAt?: string;
};

function getTenantId(event: any): string {
  // Behandle baseEvent-Mock (event.headers ist in tests teils undefined, daher Fallback prüfen)
  const headers = event.headers || {};
  return headers['x-tenant-id'] || headers['X-Tenant-ID'] || DEFAULT_TENANT_ID;
}

function mapParticipantItem(
  item:
    | {
        userId?: { S?: string };
        authUserId?: { S?: string };
        cognitoUsername?: { S?: string };
        email?: { S?: string };
        participantId?: { S?: string };
        displayName?: { S?: string };
        inviteCompletedAt?: { S?: string };
        inviteSentAt?: { S?: string };
      }
    | undefined,
): ParticipantProfileFields | null {
  if (!item) return null;
  const userId = item.userId?.S?.trim();
  if (!userId) return null;
  return {
    userId,
    authUserId: item.authUserId?.S?.trim() || undefined,
    cognitoUsername: item.cognitoUsername?.S?.trim() || undefined,
    email: item.email?.S?.trim() || undefined,
    participantId: item.participantId?.S?.trim() || undefined,
    displayName: item.displayName?.S?.trim() || undefined,
    inviteCompletedAt: item.inviteCompletedAt?.S?.trim() || undefined,
    inviteSentAt: item.inviteSentAt?.S?.trim() || undefined,
  };
}

/** Same-studio link: find existing profile by cognitoUsername (#342). */
async function findParticipantByCognitoUsername(
  tenantId: string,
  cognitoUsername: string,
): Promise<ParticipantProfileFields | null> {
  const table = process.env.PARTICIPANTS_TABLE;
  const username = cognitoUsername.trim();
  if (!table || !username) return null;
  try {
    // Important: DynamoDB applies Limit before FilterExpression — never Limit a filtered query.
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    do {
      const resp = await dynamodb.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "tenantId = :tenantId",
          FilterExpression: "cognitoUsername = :cognitoUsername",
          ExpressionAttributeValues: {
            ":tenantId": { S: tenantId },
            ":cognitoUsername": { S: username },
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of resp.Items ?? []) {
        const mapped = mapParticipantItem(item as Parameters<typeof mapParticipantItem>[0]);
        if (mapped) return mapped;
      }
      exclusiveStartKey = resp.LastEvaluatedKey as Record<string, AttributeValue> | undefined;
    } while (exclusiveStartKey);
  } catch (err) {
    console.warn("findParticipantByCognitoUsername failed:", err);
  }
  return null;
}

async function findParticipantByNickname(
  tenantId: string,
  nickname: string,
): Promise<ParticipantProfileFields | null> {
  const table = process.env.PARTICIPANTS_TABLE;
  const nicknameCheck = validateNickname(nickname);
  if (!table || !nicknameCheck.ok) return null;
  const nicknameRaw = nicknameCheck.nickname;
  const normalized = nicknameRaw.toLowerCase();
  try {
    // Prefer exact key (preserves first-entered casing), then lowercase, then GSI.
    for (const key of Array.from(new Set([nicknameRaw, normalized]))) {
      const exact = await dynamodb.send(
        new GetItemCommand({
          TableName: table,
          Key: { tenantId: { S: tenantId }, userId: { S: key } },
          ConsistentRead: true,
        }),
      );
      const fromExact = mapParticipantItem(exact.Item as any);
      if (fromExact) return fromExact;
    }

    const queryResp = await dynamodb.send(
      new QueryCommand({
        TableName: table,
        IndexName: PARTICIPANTS_NORMALIZED_INDEX,
        KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
          ":userIdNormalized": { S: normalized },
        },
        Limit: 1,
      }),
    );
    return mapParticipantItem(queryResp.Items?.[0] as any);
  } catch (err) {
    console.warn("findParticipantByNickname failed:", err);
    return null;
  }
}

async function hasTenantMembership(tenantId: string, userId: string): Promise<boolean> {
  if (!process.env.MEMBERSHIPS_TABLE || !userId.trim()) return false;
  try {
    const resp = await dynamodb.send(
      new GetItemCommand({
        TableName: process.env.MEMBERSHIPS_TABLE,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
        ConsistentRead: true,
      }),
    );
    return !!resp.Item?.role?.S;
  } catch (err) {
    console.warn("hasTenantMembership failed:", err);
    return false;
  }
}

/** Current studio member — must not be re-linked as another person (#342). */
function isCurrentStudioMember(hasMembership: boolean): boolean {
  return hasMembership;
}

async function trySendReactivationMail(params: {
  toEmail: string;
  nickname: string;
  displayName?: string;
  tenantId: string;
  studioName?: string;
  studioContact?: StudioContact;
  mailLocale: string;
}): Promise<boolean> {
  const to = params.toEmail.trim();
  if (!to) return false;
  const baseUrl = resolveAppBaseUrlForTenant(params.tenantId);
  const reactivationMail = buildReactivationMail({
    locale: params.mailLocale,
    nickname: params.nickname,
    displayName: params.displayName,
    loginUrl: baseUrl,
    studioName: params.studioName,
    studioUrl: baseUrl,
    studioContact: params.studioContact,
  });
  try {
    await ses.send(
      new SendEmailCommand({
        Source: resolveSesSourceEmail(),
        Destination: { ToAddresses: [to] },
        Message: toSesAuthMessage(reactivationMail),
      }),
    );
    return true;
  } catch (mailErr: any) {
    console.warn("SES reactivation email warning:", mailErr?.message || mailErr);
    return false;
  }
}

function generateSafeTempPassword(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

function generateOneTimeToken(bytes = 32) {
  // base64url => keine "/" oder "+" im Token (besser für URL-Parameter).
  return crypto.randomBytes(bytes).toString("base64url");
}

async function saveParticipantProfile(params: {
  tenantId: string;
  userId: string;
  participantId?: string;
  displayName?: string;
  email?: string;
  inviteSentAt?: string;
  cognitoUsername?: string;
  authUserId?: string;
  latestAuthTokenNonce?: string;
}): Promise<string> {
  if (!process.env.PARTICIPANTS_TABLE) {
    console.warn("PARTICIPANTS_TABLE environment variable not set, skipping participant profile write.");
    return params.participantId?.trim() || generateParticipantId();
  }

  let item: Record<string, AttributeValue> = {
    tenantId: { S: params.tenantId },
    userId: { S: params.userId },
    userIdNormalized: { S: params.userId.toLowerCase() },
  };

  try {
    const existing = await dynamodb.send(
      new GetItemCommand({
        TableName: process.env.PARTICIPANTS_TABLE,
        Key: {
          tenantId: { S: params.tenantId },
          userId: { S: params.userId },
        },
        ConsistentRead: true,
      }),
    );
    if (existing.Item) {
      item = {
        ...existing.Item,
        tenantId: { S: params.tenantId },
        userId: { S: params.userId },
        userIdNormalized: { S: params.userId.toLowerCase() },
      };
    }
  } catch (err) {
    console.warn("Could not read existing participant profile, proceeding with upsert.", err);
  }

  const participantIdValue =
    params.participantId?.trim() ||
    item.participantId?.S?.trim() ||
    generateParticipantId();
  item.participantId = { S: participantIdValue };

  if (Object.prototype.hasOwnProperty.call(params, "displayName")) {
    const displayName = params.displayName?.trim();
    if (displayName) item.displayName = { S: displayName };
    else delete item.displayName;
  }

  if (params.email && params.email.trim()) {
    item.email = { S: params.email.trim() };
  }
  if (params.inviteSentAt && params.inviteSentAt.trim()) {
    item.inviteSentAt = { S: params.inviteSentAt };
  }
  if (params.cognitoUsername && params.cognitoUsername.trim()) {
    item.cognitoUsername = { S: params.cognitoUsername.trim() };
  }
  if (params.authUserId && params.authUserId.trim()) {
    item.authUserId = { S: params.authUserId.trim() };
  }
  if (params.latestAuthTokenNonce && params.latestAuthTokenNonce.trim()) {
    item.latestAuthTokenNonce = { S: params.latestAuthTokenNonce.trim() };
  }

  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.PARTICIPANTS_TABLE,
      Item: item,
    }),
  );
  return participantIdValue;
}

export const handler = async (event: any) => {
  console.log('EVENT:', JSON.stringify(event));
  // Debug: Environment Variables ausgeben
  console.log('Environment Variables:', {
    SES_SOURCE_EMAIL: process.env.SES_SOURCE_EMAIL,
    USER_POOL_ID: process.env.USER_POOL_ID,
    BASE_URL: process.env.BASE_URL
  });  

  if (event.body == null) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
  }
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { email, nickname, role, displayName, linkExisting, forceNew, sendEmail } = body ?? {};
  const forceNewIdentity = forceNew === true;
  /** Default true for invite/list flows; Create dialog passes false (#345). */
  const shouldSendEmail = sendEmail !== false;
  const linkCognitoUsername =
    linkExisting &&
    typeof linkExisting === "object" &&
    typeof (linkExisting as { cognitoUsername?: unknown }).cognitoUsername === "string"
      ? (linkExisting as { cognitoUsername: string }).cognitoUsername.trim()
      : "";
  const linkAuthUserId =
    linkExisting &&
    typeof linkExisting === "object" &&
    typeof (linkExisting as { authUserId?: unknown }).authUserId === "string"
      ? (linkExisting as { authUserId: string }).authUserId.trim()
      : "";
  const hasExplicitLink = !!(linkCognitoUsername || linkAuthUserId);
  if (forceNewIdentity && hasExplicitLink) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "linkExisting and forceNew cannot be combined",
        code: "identity_conflict",
      }),
    };
  }
  const tenantId = getTenantId(event);
  const { userId: actorUserId } = getTenantContext(event as any);
  const tokensTable = process.env.AUTH_TOKENS_TABLE;
  const mailLocale = process.env.MAIL_LOCALE || "de";
  const { studioName, studioContact } = await loadStudioMailContext(
    dynamodb,
    process.env.TENANTS_TABLE,
    tenantId,
  );

  const emailNormalized = typeof email === "string" ? email.trim() : "";
  const hasEmail = emailNormalized.length > 0;
  const nicknameCheck = validateNickname(typeof nickname === "string" ? nickname : "");
  if (!nicknameCheck.ok) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: nicknameCheck.message,
        code: nicknameCheck.code,
      }),
    };
  }
  const nicknameRaw = nicknameCheck.nickname;
  const nicknameNormalized = nicknameRaw.toLowerCase();

  const displayNameProvided = Object.prototype.hasOwnProperty.call(body ?? {}, "displayName");
  let displayNameCanonical: string | undefined;
  if (displayNameProvided) {
    const displayNameCheck = validateDisplayName(
      typeof displayName === "string" ? displayName : "",
    );
    if (!displayNameCheck.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: displayNameCheck.message,
          code: displayNameCheck.code,
        }),
      };
    }
    displayNameCanonical = displayNameCheck.displayName;
  }

  if (!role) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // AuthZ guard: instructors may only create/invite participants.
  // (Admins may invite all supported roles.)
  let actorRole: string | undefined;
  if (actorUserId && process.env.MEMBERSHIPS_TABLE) {
    try {
      const actorMembership = await dynamodb.send(
        new GetItemCommand({
          TableName: process.env.MEMBERSHIPS_TABLE,
          Key: {
            tenantId: { S: tenantId },
            userId: { S: actorUserId },
          },
          ConsistentRead: true,
        }),
      );
      actorRole = actorMembership.Item?.role?.S;
    } catch (authErr) {
      console.warn("Could not resolve actor membership role in createParticipants:", authErr);
    }
  }
  if (actorRole === "instructor" && role !== "participant") {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Instructors can only create/invite participants" }),
    };
  }

  // "First entry wins": resolve canonical userId case-insensitively.
  let canonicalUserId = nicknameRaw;
  /** Cognito pool Username — opaque for new users (#324); legacy may equal nickname. */
  let cognitoUsername = "";
  let existingAuthUserId: string | undefined;
  let existingEmail: string | undefined;
  let existingInviteCompletedAt: string | undefined;
  let existingInviteSentAt: string | undefined;
  let existingDisplayName: string | undefined;
  let existingProfileFound = false;
  let existingStoredCognitoUsername: string | undefined;
  let participantId = generateParticipantId();
  if (process.env.PARTICIPANTS_TABLE) {
    try {
      const existingExactLower = await dynamodb.send(
        new GetItemCommand({
          TableName: process.env.PARTICIPANTS_TABLE,
          Key: { tenantId: { S: tenantId }, userId: { S: nicknameNormalized } },
          ConsistentRead: true,
        }),
      );
      const lowerItem = existingExactLower.Item as
        | {
            userId?: { S?: string };
            authUserId?: { S?: string };
            cognitoUsername?: { S?: string };
            email?: { S?: string };
            participantId?: { S?: string };
            inviteCompletedAt?: { S?: string };
            inviteSentAt?: { S?: string };
            displayName?: { S?: string };
          }
        | undefined;
      if (lowerItem?.userId?.S) {
        existingProfileFound = true;
        canonicalUserId = lowerItem.userId.S;
        existingStoredCognitoUsername = lowerItem.cognitoUsername?.S?.trim() || undefined;
        cognitoUsername = existingStoredCognitoUsername || "";
        existingAuthUserId = lowerItem.authUserId?.S;
        existingEmail = lowerItem.email?.S;
        existingInviteCompletedAt = lowerItem.inviteCompletedAt?.S?.trim() || undefined;
        existingInviteSentAt = lowerItem.inviteSentAt?.S?.trim() || undefined;
        existingDisplayName = lowerItem.displayName?.S?.trim() || undefined;
        if (lowerItem.participantId?.S?.trim()) participantId = lowerItem.participantId.S.trim();
      } else {
        const queryResp = await dynamodb.send(
          new QueryCommand({
            TableName: process.env.PARTICIPANTS_TABLE,
            IndexName: PARTICIPANTS_NORMALIZED_INDEX,
            KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
            ExpressionAttributeValues: {
              ":tenantId": { S: tenantId },
              ":userIdNormalized": { S: nicknameNormalized },
            },
            Limit: 1,
          }),
        );
        const matched = queryResp.Items?.[0];
        if (matched?.userId?.S) {
          existingProfileFound = true;
          canonicalUserId = matched.userId.S;
          existingStoredCognitoUsername = matched.cognitoUsername?.S?.trim() || undefined;
          cognitoUsername = existingStoredCognitoUsername || "";
          existingAuthUserId = matched.authUserId?.S;
          existingEmail = matched.email?.S;
          existingInviteCompletedAt = matched.inviteCompletedAt?.S?.trim() || undefined;
          existingInviteSentAt = matched.inviteSentAt?.S?.trim() || undefined;
          existingDisplayName = matched.displayName?.S?.trim() || undefined;
          if (matched.participantId?.S?.trim()) participantId = matched.participantId.S.trim();
        }
      }
    } catch (lookupErr) {
      console.warn("Failed canonical participant lookup, fallback to raw nickname", lookupErr);
    }
  }

  // Re-invite / list invite without displayName in body: greet from stored profile (#345).
  if (!displayNameCanonical && existingDisplayName) {
    displayNameCanonical = existingDisplayName;
  }

  if (actorRole === "instructor" && process.env.MEMBERSHIPS_TABLE) {
    try {
      const targetMembership = await dynamodb.send(
        new GetItemCommand({
          TableName: process.env.MEMBERSHIPS_TABLE,
          Key: {
            tenantId: { S: tenantId },
            userId: { S: canonicalUserId },
          },
          ConsistentRead: true,
        }),
      );
      const targetRole = targetMembership.Item?.role?.S;
      if (targetRole && targetRole !== "participant") {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Instructors can only invite participant accounts" }),
        };
      }
    } catch (authErr) {
      console.warn("Could not resolve target membership role in createParticipants:", authErr);
    }
  }

  // Security hardening (#94): token table required only when we actually send invite/reset mail.
  if (hasEmail && shouldSendEmail && !tokensTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "AUTH_TOKENS_TABLE is required for secure invite flow",
      }),
    };
  }

  // Quiet create (no mail): Dynamo only — store email, skip Cognito until explicit invite (#345).
  // Exceptions: linkExisting attaches Cognito; forceNew creates a new pool user — both without SES.
  if ((!hasEmail || !shouldSendEmail) && !hasExplicitLink && !forceNewIdentity) {
    const reactivated = !!existingAuthUserId;
    let emailSent = false;
    let emailAttempted = false;
    try {
      if (process.env.MEMBERSHIPS_TABLE) {
        await dynamodb.send(
          new PutItemCommand({
            TableName: process.env.MEMBERSHIPS_TABLE,
            Item: {
              tenantId: { S: tenantId },
              userId: { S: canonicalUserId },
              participantId: { S: participantId },
              role: { S: role },
            },
          }),
        );
        console.log(
          `Membership saved in DynamoDB (quiet/no-cognito): user=${canonicalUserId}, tenant=${tenantId}, role=${role}`,
        );
      } else {
        console.warn(
          "MEMBERSHIPS_TABLE environment variable not set, skipping DynamoDB write.",
        );
      }

      await saveParticipantProfile({
        tenantId,
        userId: canonicalUserId,
        participantId,
        ...(hasEmail ? { email: emailNormalized } : {}),
        ...(displayNameCanonical ? { displayName: displayNameCanonical } : {}),
      });

      // Reactivation info mail: also when Create uses sendEmail:false (Fall 1, #345).
      const mailTo = (hasEmail ? emailNormalized : existingEmail)?.trim();
      if (reactivated && mailTo) {
        emailAttempted = true;
        emailSent = await trySendReactivationMail({
          toEmail: mailTo,
          nickname: nicknameRaw,
          displayName: displayNameCanonical,
          tenantId,
          studioName,
          studioContact,
          mailLocale,
        });
      }
    } catch (err: any) {
      console.error("Failed to save membership in DynamoDB:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to create participant" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        username: canonicalUserId,
        emailSent,
        emailAttempted,
        reactivated,
        ...(shouldSendEmail && !hasEmail && !emailSent
          ? {
              warning:
                "E-Mail fehlt – Cognito/SES übersprungen. Teilnehmer wurde nur in DynamoDB angelegt.",
            }
          : !shouldSendEmail && !reactivated
            ? {
                warning:
                  "Ohne Benachrichtigung angelegt. Cognito/Einladung erst bei explizitem Einladen.",
              }
            : !shouldSendEmail && reactivated && emailAttempted && !emailSent
              ? {
                  warning:
                    "Reaktiviert, aber Info-Mail konnte nicht versendet werden.",
                }
              : {}),
      }),
    };
  }

  if (!hasEmail) {
    // Unreachable: handled above. Keep TypeScript narrowing for email branch.
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing email" }),
    };
  }

  // Internal bootstrap password to move Cognito users into a reset-code-capable state.
  const rawPassword = generateSafeTempPassword(10) + "A1"; // ensure mix / length

  const poolId = process.env.USER_POOL_ID!;

  // #324/#342: Opaque Cognito Username for new users. Same email may map to many pool users.
  // Auto-link by email is NOT default — only explicit linkExisting (or existing tenant profile / legacy).
  let linkedExistingPoolUser = false;
  let linkedAuthUserId: string | undefined;
  let linkedPoolStatus: string | undefined;
  /** Orphaned/same-studio profile reused via link — info mail even when sendEmail:false. */
  let sameStudioReactivation = false;

  if (existingStoredCognitoUsername) {
    cognitoUsername = existingStoredCognitoUsername;
    linkedExistingPoolUser = true;
    const stored = await resolveCognitoUsernameAndSub(
      cognito,
      poolId,
      existingStoredCognitoUsername,
      canonicalUserId,
    );
    if (stored?.username) {
      cognitoUsername = stored.username;
      linkedAuthUserId = stored.sub;
      linkedPoolStatus = stored.status;
    }
  } else if (hasExplicitLink) {
    let resolvedLink =
      linkCognitoUsername
        ? await resolveCognitoUsernameAndSub(cognito, poolId, linkCognitoUsername, linkCognitoUsername)
        : null;
    const emailMatches = await listCognitoUsersByEmail(cognito, poolId, emailNormalized);
    if (!resolvedLink && linkAuthUserId) {
      const match = emailMatches.find((c) => c.authUserId === linkAuthUserId);
      if (match) {
        resolvedLink = await resolveCognitoUsernameAndSub(
          cognito,
          poolId,
          match.cognitoUsername,
          match.cognitoUsername,
        );
      }
    }
    if (!resolvedLink?.username) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "linkExisting Cognito user not found",
          code: "link_not_found",
        }),
      };
    }
    const linkedInEmailSet = emailMatches.some(
      (c) => c.cognitoUsername === resolvedLink!.username,
    );
    if (!linkedInEmailSet) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "linkExisting email does not match request email",
          code: "link_email_mismatch",
        }),
      };
    }
    cognitoUsername = resolvedLink.username;
    linkedAuthUserId = resolvedLink.sub;
    linkedPoolStatus = resolvedLink.status;
    linkedExistingPoolUser = true;

    // Same studio: reuse existing participant row; do not invent a second userId (#342).
    const poolNickname =
      emailMatches.find((c) => c.cognitoUsername === resolvedLink.username)?.nickname?.trim() ||
      "";
    const existingLinked =
      (await findParticipantByCognitoUsername(tenantId, resolvedLink.username)) ||
      (poolNickname ? await findParticipantByNickname(tenantId, poolNickname) : null);

    if (existingLinked) {
      const linkedHasMembership = await hasTenantMembership(tenantId, existingLinked.userId);
      if (isCurrentStudioMember(linkedHasMembership)) {
        const status = getParticipantStatus(existingLinked);
        const statusHint =
          status === "invited"
            ? "bereits eingeladen"
            : status === "active"
              ? "bereits registriert"
              : "bereits Mitglied";
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: `Dieses Konto ist als „${existingLinked.userId}“ ${statusHint} in diesem Studio.`,
            code: "already_in_tenant",
            tenantUserId: existingLinked.userId,
            tenantStatus: status,
          }),
        };
      }
      existingProfileFound = true;
      canonicalUserId = existingLinked.userId;
      existingStoredCognitoUsername =
        existingLinked.cognitoUsername || resolvedLink.username;
      existingAuthUserId = existingLinked.authUserId || linkedAuthUserId;
      existingEmail = existingLinked.email || existingEmail;
      existingInviteCompletedAt =
        existingLinked.inviteCompletedAt || existingInviteCompletedAt;
      existingInviteSentAt = existingLinked.inviteSentAt || existingInviteSentAt;
      if (existingLinked.participantId) participantId = existingLinked.participantId;
      sameStudioReactivation = true;
    } else if (poolNickname) {
      const poolNickCheck = validateNickname(poolNickname);
      if (poolNickCheck.ok) {
        // First membership in this tenant: studio login = Cognito nickname, not form nickname.
        canonicalUserId = poolNickCheck.nickname;
        existingStoredCognitoUsername = undefined;
        existingAuthUserId = undefined;
        existingProfileFound = false;
        participantId = generateParticipantId();
      }
    }

    if (actorRole === "instructor" && process.env.MEMBERSHIPS_TABLE) {
      try {
        const targetMembership = await dynamodb.send(
          new GetItemCommand({
            TableName: process.env.MEMBERSHIPS_TABLE,
            Key: {
              tenantId: { S: tenantId },
              userId: { S: canonicalUserId },
            },
            ConsistentRead: true,
          }),
        );
        const targetRole = targetMembership.Item?.role?.S;
        if (targetRole && targetRole !== "participant") {
          return {
            statusCode: 403,
            body: JSON.stringify({ error: "Instructors can only invite participant accounts" }),
          };
        }
      } catch (authErr) {
        console.warn("Could not resolve target membership after linkExisting:", authErr);
      }
    }
  } else if (!cognitoUsername) {
    if (forceNewIdentity) {
      // Explicit new person despite same email (#342) — skip legacy Username=nickname reuse.
      cognitoUsername = generateOpaqueCognitoUsername();
    } else {
      // Legacy dual-path: profile without cognitoUsername may still have Username=nickname in pool.
      const legacy = await resolveCognitoUsernameAndSub(cognito, poolId, canonicalUserId, nicknameRaw);
      if (legacy?.username) {
        cognitoUsername = legacy.username;
        linkedAuthUserId = legacy.sub;
        linkedPoolStatus = legacy.status;
        linkedExistingPoolUser = true;
      } else {
        cognitoUsername = generateOpaqueCognitoUsername();
      }
    }
  }

  // After linkExisting may have rebound canonicalUserId to the existing studio login (#342).
  const userId = canonicalUserId;

  let reactivated = false;
  try {
    if (linkedExistingPoolUser) {
      // Bestehenden Pool-User nicht „umbenennen“: Cognito-nickname ist global im Pool.
      // Studio-Login-Name lebt in Dynamo userId; Login über resolve-login (#324).
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: poolId,
          Username: cognitoUsername,
          UserAttributes: [
            { Name: "email", Value: emailNormalized },
            { Name: "email_verified", Value: "true" },
          ],
        }),
      );
      // Reactivation: confirmed Cognito + completed registration evidence.
      // Incomplete invites also end up CONFIRMED (Permanent password on create) — do not
      // treat bare pool presence / !existingProfileFound as reactivation.
      // Still-invited (inviteSentAt, no inviteCompletedAt) keeps invite/password path.
      const alreadyActiveInStudio =
        existingProfileFound &&
        !!existingAuthUserId &&
        (!!existingInviteCompletedAt || !existingInviteSentAt);
      const completedHere = !!existingInviteCompletedAt;
      let completedElsewhere = false;
      if (
        !alreadyActiveInStudio &&
        !completedHere &&
        !existingProfileFound &&
        hasExplicitLink &&
        linkedAuthUserId &&
        linkedPoolStatus === "CONFIRMED" &&
        process.env.PARTICIPANTS_TABLE
      ) {
        completedElsewhere = await hasCompletedInviteForPoolUser({
          client: dynamodb,
          participantsTable: process.env.PARTICIPANTS_TABLE,
          cognitoUsername,
          authUserId: linkedAuthUserId,
        });
      }
      if (
        linkedAuthUserId &&
        linkedPoolStatus === "CONFIRMED" &&
        (alreadyActiveInStudio || completedHere || completedElsewhere)
      ) {
        // Do not reset password / send invite-registration mail (#342).
        reactivated = true;
      } else if (shouldSendEmail) {
        await cognito.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: poolId,
            Username: cognitoUsername,
            Password: rawPassword,
            Permanent: true,
          }),
        );
      }
      // Quiet link of non-active: attach Cognito only; password/invite later (#345).
    } else {
      // New Cognito user: opaque Username (#324), studio login name only as nickname attribute.
      // Keep FORCE_CHANGE_PASSWORD (no Permanent) until invite token completes — avoids
      // false "reactivated" when an invite is withdrawn and later re-linked.
      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: cognitoUsername,
          TemporaryPassword: rawPassword,
          UserAttributes: [
            { Name: "email", Value: emailNormalized },
            { Name: "email_verified", Value: "true" },
            { Name: "nickname", Value: nicknameRaw },
            { Name: "custom:role", Value: role },
          ],
          MessageAction: "SUPPRESS",
        }),
      );
    }
  } catch (err: any) {
    // If user exists, re-prepare account for token-based reset link flow.
    if (err?.name === "UsernameExistsException") {
      let hasLoginProfile = false;
      if (process.env.PARTICIPANTS_TABLE) {
        try {
          const existingParticipantResp = await dynamodb.send(
            new GetItemCommand({
              TableName: process.env.PARTICIPANTS_TABLE,
              Key: {
                tenantId: { S: tenantId },
                userId: { S: userId },
              },
              ConsistentRead: true,
            }),
          );
          let existingParticipant = existingParticipantResp.Item as
            | { authUserId?: { S?: string } }
            | undefined;
          // Backward compatibility for legacy mixed-case profile keys.
          if (!existingParticipant && nicknameRaw !== userId) {
            const legacyProfileResp = await dynamodb.send(
              new GetItemCommand({
                TableName: process.env.PARTICIPANTS_TABLE,
                Key: {
                  tenantId: { S: tenantId },
                  userId: { S: nicknameRaw },
                },
                ConsistentRead: true,
              }),
            );
            existingParticipant = legacyProfileResp.Item as
              | { authUserId?: { S?: string } }
              | undefined;
          }
          hasLoginProfile = !!(existingAuthUserId || existingParticipant?.authUserId?.S);
        } catch (profileErr) {
          console.warn("Could not read participant profile, fallback to password reset flow.", profileErr);
        }
      }

      if (hasLoginProfile) {
        reactivated = false;
        console.log("Username exists with login; resending token-based invite (recovery).");
        try {
          await cognito.send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: poolId,
              Username: cognitoUsername,
              UserAttributes: [
                { Name: "email", Value: emailNormalized },
                { Name: "email_verified", Value: "true" },
              ],
            }),
          );
          await cognito.send(
            new AdminSetUserPasswordCommand({
              UserPoolId: poolId,
              Username: cognitoUsername,
              Password: rawPassword,
              Permanent: true,
            }),
          );
        } catch (err2: any) {
          console.error("AdminUpdateUserAttributes/AdminSetUserPassword failed (registered user resend):", err2);
          return { statusCode: 500, body: JSON.stringify({ error: "Failed to prepare existing user" }) };
        }
      } else {
        console.log("Username exists; preparing account state for token-based reset.");
        try {
          await cognito.send(
            new AdminSetUserPasswordCommand({
              UserPoolId: poolId,
              Username: cognitoUsername,
              Password: rawPassword,
              Permanent: true,
            }),
          );
          await cognito.send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: poolId,
              Username: cognitoUsername,
              UserAttributes: [
                { Name: "email", Value: emailNormalized },
                { Name: "email_verified", Value: "true" },
              ],
            }),
          );
        } catch (err2: any) {
          console.error("AdminSetUserPassword/AdminUpdateUserAttributes failed:", err2);
          return { statusCode: 500, body: JSON.stringify({ error: "Failed to prepare existing user" }) };
        }
      }
    } else {
      console.error("AdminCreateUser/link failed:", err);
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to create user" }) };
    }
  }

  // 2. Gruppe zuweisen
  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: poolId,
      Username: cognitoUsername,
      GroupName: role,
    }));
  } catch (err: any) {
    console.warn("Group assignment error (ignored):", err.message);
  }

  // 3. UserTenantMembership in DynamoDB speichern
  try {
    if (process.env.MEMBERSHIPS_TABLE) {
      await dynamodb.send(new PutItemCommand({
        TableName: process.env.MEMBERSHIPS_TABLE,
        Item: {
          tenantId: { S: tenantId },
          userId: { S: userId },
          participantId: { S: participantId },
          role: { S: role }
        }
      }));
      console.log(`Membership saved in DynamoDB: user=${userId}, tenant=${tenantId}, role=${role}`);
    } else {
      console.warn("MEMBERSHIPS_TABLE environment variable not set, skipping DynamoDB write.");
    }
  } catch (err: any) {
    console.error("Failed to save membership in DynamoDB:", err);
    // Wir werfen hier keinen Fehler, da der User in Cognito bereits existiert,
    // aber wir loggen es deutlich.
  }

  // Cognito-Username mit Dynamo abgleichen (kanonischer Username).
  // authUserId nur bei Multi-Studio-Reaktivierung sofort setzen; sonst nach Invite-Abschluss (#324).
  if (poolId) {
    const resolved = await resolveCognitoUsernameAndSub(cognito, poolId, cognitoUsername, userId);
    if (resolved) {
      cognitoUsername = resolved.username;
      if (resolved.sub) linkedAuthUserId = linkedAuthUserId || resolved.sub;
      try {
        await saveParticipantProfile({
          tenantId,
          userId,
          participantId,
          email: emailNormalized,
          cognitoUsername: resolved.username,
          ...(linkedExistingPoolUser && linkedAuthUserId && reactivated
            ? { authUserId: linkedAuthUserId }
            : {}),
          ...(displayNameCanonical ? { displayName: displayNameCanonical } : {}),
        });
      } catch (syncErr) {
        console.warn("Could not persist Cognito sync to participant profile:", syncErr);
      }
    } else {
      console.warn(
        `AdminGetUser failed for invite user: tried cognitoUsername=${cognitoUsername}, userId=${userId}`,
      );
    }
  }

  // Quiet link/create: no invite token / no invite SES (#345).
  // Info-Mail when reactivated via nickname OR linkExisting (link ≈ reactivation).
  // New profile / forceNew / non-reactivated link: no mail — invite later.
  if (!shouldSendEmail) {
    let emailSent = false;
    let emailAttempted = false;
    const shouldMailReactivation =
      reactivated && (sameStudioReactivation || hasExplicitLink);
    if (shouldMailReactivation) {
      emailAttempted = true;
      const mailTo = (emailNormalized || existingEmail || "").trim();
      emailSent = await trySendReactivationMail({
        toEmail: mailTo,
        nickname: userId,
        displayName: displayNameCanonical,
        tenantId,
        studioName,
        studioContact,
        mailLocale,
      });
      if (!emailSent) {
        console.warn(
          `Quiet reactivation/link: SES info mail not sent (to=${mailTo || "<empty>"}, userId=${userId})`,
        );
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        username: userId,
        emailSent,
        emailAttempted,
        reactivated,
        ...(emailSent
          ? {}
          : {
              warning: emailAttempted
                ? "Zugang freigeschaltet, aber Info-Mail konnte nicht versendet werden."
                : hasExplicitLink
                  ? "Verknüpft ohne Benachrichtigung. Einladung später explizit senden."
                  : "Ohne Benachrichtigung angelegt. Einladung später explizit senden.",
            }),
      }),
    };
  }

  // Build link (nickname query = Studio-Login-Name, not opaque Cognito Username #324)
  const baseUrl = resolveAppBaseUrlForTenant(tenantId);
  const tokenTtlSeconds = resolveAuthTokenTtlSeconds("invite-activation");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const displayNameQuery = displayNameCanonical
    ? `&displayName=${encodeURIComponent(displayNameCanonical)}`
    : "";

  let oneTimeToken: string | undefined;
  let oneTimeTokenNonce: string | undefined;
  let link = `${baseUrl}/invite?mode=invite_activation&nickname=${encodeURIComponent(userId)}&email=${encodeURIComponent(emailNormalized)}${displayNameQuery}`;

  // Token nur für "echte Einladung" (nicht für Reaktivierung ohne Passwortreset).
  if (!reactivated && tokensTable) {
    oneTimeToken = generateOneTimeToken();
    oneTimeTokenNonce = generateOneTimeToken(12);
    try {
      await dynamodb.send(
        new PutItemCommand({
          TableName: tokensTable,
          Item: {
            tenantId: { S: tenantId },
            token: { S: oneTimeToken },
            cognitoUsername: { S: cognitoUsername },
            userId: { S: userId },
            purpose: { S: "invite-activation" },
            tokenNonce: { S: oneTimeTokenNonce },
            createdAt: { N: String(nowSeconds) },
            expiresAt: { N: String(nowSeconds + tokenTtlSeconds) },
          },
        }),
      );
    } catch (tokenErr) {
      console.warn("Failed to store one-time token:", tokenErr);
      oneTimeToken = undefined;
    }

    if (oneTimeToken) {
      link = `${baseUrl}/invite?mode=invite_activation&tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(
        oneTimeToken,
      )}&nickname=${encodeURIComponent(userId)}&email=${encodeURIComponent(emailNormalized)}${displayNameQuery}`;
    }
  }

  if (!reactivated && !oneTimeToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create secure invite token",
      }),
    };
  }

  // Send invitation email (Token-Link, kein temporäres Passwort im E-Mail-Body)
  const reactivationMail = buildReactivationMail({
    locale: mailLocale,
    nickname: nicknameRaw,
    displayName: displayNameCanonical,
    loginUrl: baseUrl,
    studioName,
    studioUrl: baseUrl,
    studioContact,
  });
  const inviteMail = buildInviteMail({
    locale: mailLocale,
    nickname: nicknameRaw,
    displayName: displayNameCanonical,
    link,
    studioName,
    studioUrl: baseUrl,
    studioContact,
  });

  let emailSent = false;
  try {
    const sesSourceEmail = resolveSesSourceEmail();
    // Debug: Zeige die verwendete E-Mail-Adresse
    console.log(`📧 Verwende SES Source Email: "${sesSourceEmail}"`);
    console.log(`📧 process.env.SES_SOURCE_EMAIL = "${process.env.SES_SOURCE_EMAIL}"`);
    await ses.send(new SendEmailCommand({
      Source: sesSourceEmail,
      Destination: { ToAddresses: [emailNormalized] },
      Message: toSesAuthMessage(reactivated ? reactivationMail : inviteMail),
    }));
    emailSent = true;
    console.log("SES email sent successfully to", emailNormalized);
  } catch (err: any) {
    console.warn("SES send warning:", err?.message || err);
    // do not fail user creation if SES can't send (depending on your policy)
    // In token-basierten Flows wird kein temporäres Passwort per E-Mail verschickt.
  }

  console.log("createParticipants: created/updated username=", userId);
  // Do NOT log passwords in production normally, but log if email failed
  if (!emailSent) {
    console.warn(`⚠️ WICHTIG: E-Mail nicht versendet. User '${userId}' benötigt den Einladungslink.`);
  }

  const inviteSentAt = new Date().toISOString();
  try {
    await saveParticipantProfile({
      tenantId,
      userId,
      participantId,
      email: emailNormalized,
      inviteSentAt,
      cognitoUsername,
      latestAuthTokenNonce: oneTimeTokenNonce,
      ...(linkedExistingPoolUser && linkedAuthUserId && reactivated
        ? { authUserId: linkedAuthUserId }
        : {}),
      ...(displayNameCanonical ? { displayName: displayNameCanonical } : {}),
    });
  } catch (err: any) {
    console.warn("Failed to save participant profile (ignored):", err?.message || err);
  }

  return { 
    statusCode: 200, 
    body: JSON.stringify({ 
      success: true, 
      username: userId, 
      link,
      emailSent,
      reactivated,
      ...(emailSent || reactivated
        ? {}
        : { 
            inviteToken: oneTimeToken,
            warning: "E-Mail konnte nicht versendet werden. Bitte Einladungslink (oder Token) manuell übermitteln."
          })
    }) 
  };
};