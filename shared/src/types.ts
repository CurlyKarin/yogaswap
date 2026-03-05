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

// Verknüpfung zwischen User und Tenant inkl. Rolle und optionalen Scopes
export interface UserTenantMembership {
  // Referenz auf User (aktuell der nickname; kann später auf eine separate userId wechseln)
  userId: string;
  tenantId: string;
  role: UserTenantRole;
  // Optional: feiner granulare Berechtigungen, z. B. Instructor sieht alle Kurse
  canSeeAllCourses?: boolean;
}