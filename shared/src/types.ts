/** Standard-Tenant-ID bis Multi-Tenancy vollständig aktiv ist */
export const DEFAULT_TENANT_ID = "default-tenant";

export type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

export type CourseDateOverride = {
  // Zugehöriger Tenant (wird bei Multi-Tenancy Pflicht, aktuell optional für Migration)
  tenantId?: string;
  /** Legacy-Kurs-ID (numerisch); zusammen mit `date` Schlüsselteil und Lesbarkeit in Listen. */
  courseId: number;
  /** Stabile technische Kurs-ID (UUID), Dual-Write mit {@link Course.courseUid}. */
  courseUid?: string;
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
  /**
   * Legacy-Kurs-ID (numerisch): bleibt u. a. für lesbare Swap-Schlüssel und GSI-Range-Attribute
   * (`fromDate_fromCourseId_status`, `toDate_toCourseId_status`, `swapId`), nicht nur für UI.
   */
  fromCourseId: number;
  /** Stabile Kurs-ID am Ursprung (Dual-Write). */
  fromCourseUid?: string;
  fromDate: string;    // ISO des Ursprungstermins
  /**
   * Legacy-Kurs-ID am Ziel — wie {@link Swap.fromCourseId}: Lesbarkeit und bestehende Schlüsselpfade.
   */
  toCourseId: number;
  /** Stabile Kurs-ID am Ziel (Dual-Write). */
  toCourseUid?: string;
  toDate: string;      // ISO des Zieltermins
  status: SwapStatus;
};

export type CourseStatus = "inactive" | "draft" | "active";
export type CoursePlanningMode = "bounded_series" | "rolling_continuous";
export type CourseVisibilityMode = "fixed_window" | "rolling_horizon";

export type Course = {
  // Tenant, zu dem der Kurs gehört
  tenantId?: string;
  /**
   * Stabile technische Kurs-ID (UUID). Primärreferenz für neue API-Pfade und übergreifende Referenzen.
   *
   * Die numerische {@link Course.id} (Legacy) bleibt parallel bestehen: DynamoDB-Sort-Key,
   * zusammengesetzte Keys (Overrides `courseId_date`, Swap-IDs und GSI-Felder mit Kursbezug),
   * sowie nachvollziehbare Anzeige — nicht nur „Sortierung“.
   */
  courseUid?: string;
  /** Legacy-Kurs-ID (numerisch), entspricht der DynamoDB-SK `courseId` und numerischen Referenzen im Modell. */
  id: number;
  name: string;
  weekday: string; // z.B. "Mon", "Tue", ...
  time: string;    // z.B. "18:30"
  capacity: number;
  status?: CourseStatus;
  planningMode?: CoursePlanningMode;
  visibilityMode?: CourseVisibilityMode;
  seriesStartDate?: string;
  seriesEndDate?: string;
  visibleFrom?: string;
  visibleUntil?: string;
  visibilityHorizonWeeks?: number;
  excludedDates?: string[];
  includedDates?: string[];
  visibleDates?: string[];
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
  /**
   * Darf Instructor-Delegation in Kursen ohne explizite Instructor-Zuordnung
   * genutzt werden?
   *
   * Default (wenn undefined): true, um aktuelles Verhalten nicht zu brechen.
   * Nach Rollout kann dies auf false gestellt werden.
   */
  instructorCanManageDelegationWithoutCourseAssignment?: boolean;
  /**
   * Duerfen registrierte/aktive Teilnehmer im Vertretungsmodus verwaltet werden?
   *
   * Default (wenn undefined): true (MVP).
   * Geplante Nachschaerfung nach Rollout via Tenant-Policy.
   */
  delegationCanManageActiveParticipants?: boolean;
  /**
   * Kalendertage nach dem letzten sichtbaren Kursende: inaktive Kurse bleiben fuer
   * Teilnehmer:innen in Listen sichtbar (Swap-/Nachlauf-Fenster). Vergleich erfolgt
   * in UTC (YYYY-MM-DD). Default im Code: 7 — fachlich an Swap maxOffsetDays gekoppelt,
   * bis Studio-Einstellungen das Feld setzen.
   */
  inactiveGraceDaysAfterCourseEnd?: number;
  /**
   * Tauschfenster: fruehestens X Kalendertage relativ zum Referenztermin (oft negativ).
   * Default im Code: -7.
   */
  minOffsetDays?: number;
  /**
   * Tauschfenster: spaetestens X Kalendertage relativ zum Referenztermin.
   * Default im Code: 7.
   */
  maxOffsetDays?: number;
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
  /** Kanonische Lookup-ID für case-insensitive Suchen. */
  userIdNormalized?: string;

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