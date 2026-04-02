/** Standard-Tenant-ID bis Multi-Tenancy vollständig aktiv ist */
export const DEFAULT_TENANT_ID = "default-tenant";

export type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

export type CourseDateOverride = {
  // Zugehöriger Tenant (wird bei Multi-Tenancy Pflicht, aktuell optional für Migration)
  tenantId?: string;
  courseId: number;
  date: string; // ISO-String
  participants: string[];
  swapped?: string[]; // aktive Tausch-Teilnehmer
  waitlist?: string[]; // Nachrücker für volle Termine
  // Anonyme Schnupperteilnehmer / Blocker ohne expliziten User
  // Belegt Kapazität, ohne eine konkrete Person zu modellieren
  anonymousTrialCount?: number;
};

export type SwapStatus = "pending" | "active";

export type Swap = {
  // Tenant-Kontext für den Swap
  tenantId?: string;
  user: string;        // der Teilnehmer
  fromCourseId: number;
  fromDate: string;    // ISO des Ursprungstermins
  toCourseId: number;
  toDate: string;      // ISO des Zieltermins
  status: SwapStatus;
};

export type Course = {
  // Tenant, zu dem der Kurs gehört
  tenantId?: string;
  id: number;
  name: string;
  weekday: string; // z.B. "Mon", "Tue", ...
  time: string;    // z.B. "18:30"
  capacity: number;
  participants: string[]; // Nicknames
  dates: string[]; // Liste der Termine
  // Optional zugeordnete Kursleiter (Nicknames oder User-IDs)
  instructors?: string[];
  // Optionaler Standort / Studio innerhalb eines Tenants
  studioId?: string;
  // Optionaler Raum für zeitliche/örtliche Planung
  roomId?: string;
};

// Union-Typ für Benutzerrollen
export type UserRole = 'admin' | 'instructor' | 'participant';

// Schnittstelle für Benutzer
export interface User {
  // Eindeutiger Benutzername, dient als Primärschlüssel in DynamoDB und Cognito
  nickname: string;
  // E-Mail für Benachrichtigungen, kann sich bei mehreren Benutzern wiederholen
  email: string;
  // Benutzerrolle: admin (voller Zugriff), instructor (Kursverwaltung), participant (Standard)
  role: UserRole;
  // Optionale Verknüpfung zu einer Auth-Identität (z. B. Cognito Sub).
  // Leer bei „NoInternet“-Usern / rein verwalteten Teilnehmern.
  authUserId?: string | null;
  // Optional: Dieser Benutzer wird von einem anderen Benutzer (z. B. Trainer oder Admin) verwaltet.
  managedByUserId?: string | null;
  // Benutzerspezifische Einstellungen, z. B. Benachrichtigungspräferenzen, flexibel für zukünftige Erweiterungen
  //settings?: Record<string, unknown>;
}

// Rolle eines Users innerhalb eines bestimmten Tenants
export type UserTenantRole = UserRole;

// Fachliche Entität für ein Yogastudio / eine Organisation (Tenant).
// Kann später in einer eigenen Tabelle gespeichert und über Admin-UIs bearbeitet werden.
export interface Tenant {
  tenantId: string;
  /** Anzeigename des Studios / der Organisation */
  name: string;
  /** Konfigurierbare Einstellungen für Sichtbarkeit & Berechtigungen */
  settings?: TenantSettings;
}

// Tenant-weite Einstellungen für Sichtbarkeit & Berechtigungen.
// Alle Felder sind optional, damit bestehende Tenants ohne Migration funktionieren.
export interface TenantSettings {
  /**
   * Dürfen Instructor:innen standardmäßig alle Kurse des Tenants sehen?
   * Wenn false/undefined: Instructor:innen sehen nur Kurse, in denen sie als Instructor eingetragen sind.
   */
  instructorCanSeeAllCourses?: boolean;
  /**
   * Dürfen Instructor:innen Teilnehmer:innen einladen?
   * Wenn false/undefined: Nur Admins dürfen einladen.
   */
  instructorCanInviteParticipants?: boolean;
  /**
   * Sehen Teilnehmer:innen nur Kurse, an denen ihre Instructor:innen beteiligt sind?
   * Wenn false/undefined: Teilnehmer:innen sehen alle freigeschalteten Kurse des Tenants.
   */
  participantsSeeOnlyOwnInstructors?: boolean;
  /**
   * Dürfen Instructor:innen Teilnehmerprofile (Liste/Updates) verwalten?
   * Default für undefined: true (MVP-freundlich), kann tenant-spezifisch deaktiviert werden.
   */
  instructorCanManageParticipants?: boolean;
}

// Verknüpfung zwischen User und Tenant inkl. Rolle und optionalen Overrides.
export interface UserTenantMembership {
  // Referenz auf User (aktuell der nickname; kann später auf eine separate userId wechseln)
  userId: string;
  tenantId: string;
  role: UserTenantRole;
  /**
   * Individuelle Ausnahme: diese Instructor-Person darf alle Kurse sehen,
   * unabhängig vom Tenant-Default (TenantSettings.instructorCanSeeAllCourses).
   * Wird nur ausgewertet, wenn role === "instructor".
   */
  instructorCanSeeAllCoursesOverride?: boolean;
}

/**
 * Teilnehmerprofil innerhalb eines Tenants.
 * Dient als stabile, erweiterbare Entität für Teilnehmerverwaltung (E-Mail optional, Settings, Einladungsstatus).
 */
export interface ParticipantProfile {
  tenantId: string;
  /** Aktuell: Nickname. Kann später auf eine stabile ID migriert werden. */
  userId: string;

  /** Optional: Kontakt-E-Mail (kann nachgetragen/aktualisiert werden). */
  email?: string;

  /** Optional: Verknüpfung zur Auth-Identität (z.B. Cognito sub). */
  authUserId?: string | null;

  /** Optional: Zeitpunkt der letzten Einladung (ISO timestamp). */
  inviteSentAt?: string;

  /**
   * Gesetzt, wenn die Einladung im Client abgeschlossen ist (z. B. nach Sign-In auf /invite).
   * Ohne dieses Feld gilt ein nur serverseitig bekannter Cognito-Sub nicht als „registriert“.
   */
  inviteCompletedAt?: string;

  /** Optional: flexible, tenant-spezifische Teilnehmer-Einstellungen. */
  settings?: ParticipantSettings;
}

export type ParticipantStatus = "no_login" | "invited" | "active";

/**
 * Teilnehmer-spezifische Einstellungen.
 *
 * Design-Ziel: offen für Erweiterungen, aber mit typsicheren "bekannten" Feldern,
 * sobald ihr konkrete Use-Cases (Waitlist/Notifications) implementiert.
 */
export type ParticipantSettings = {
  /**
   * Wenn gesetzt: Teilnehmer möchte nicht mehr nachrücken, wenn der Kurs weniger
   * als X Minuten in der Zukunft liegt.
   */
  waitlistNoPromoteWithinMinutes?: number;

  /** Benachrichtigungspräferenzen (MVP-freundlich, später erweiterbar). */
  notifications?: {
    enabled?: boolean;
    /** z.B. "swap_active", "swap_pending", "waitlist_promoted" */
    events?: string[];
    /** z.B. ["email"] */
    channels?: Array<"email">;
  };

  /** Erweiterungspunkt für zukünftige Einstellungen. */
  [key: string]: unknown;
};

/**
 * Ableitung des Teilnehmer-Status aus Profilfeldern (ohne eigenes Status-Feld).
 */
export function getParticipantStatus(
  profile: Pick<ParticipantProfile, "authUserId" | "inviteSentAt" | "inviteCompletedAt">,
): ParticipantStatus {
  const auth = profile.authUserId?.trim();
  const invitedFlag = profile.inviteSentAt?.trim();
  const done = profile.inviteCompletedAt?.trim();
  if (auth) {
    if (done) return "active";
    if (!invitedFlag) return "active";
    return "invited";
  }
  if (invitedFlag) return "invited";
  return "no_login";
}