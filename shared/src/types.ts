export type CourseDateOverride = {
  courseId: number;
  date: string; // ISO-String
  participants: string[];
  swapped?: string[]; // aktive Tausch-Teilnehmer
  waitlist?: string[]; // Nachrücker für volle Termine
};

export type SwapStatus = "pending" | "active";

export type Swap = {
  user: string;        // der Teilnehmer
  fromCourseId: number;
  fromDate: string;    // ISO des Ursprungstermins
  toCourseId: number;
  toDate: string;      // ISO des Zieltermins
  status: SwapStatus;
};

export type Course = {
  id: number;
  name: string;
  weekday: string; // z.B. "Mon", "Tue", ...
  time: string;    // z.B. "18:30"
  capacity: number;
  participants: string[]; // Nicknames
  dates: string[]; // Liste der Termine
};

// Union-Typ für Benutzerrollen
export type UserRole = 'admin' | 'instructor' | 'participant' | 'trial';

// Schnittstelle für Benutzer
export interface User {
  // Eindeutiger Benutzername, dient als Primärschlüssel in DynamoDB und Cognito
  nickname: string;
  // E-Mail für Benachrichtigungen, kann sich bei mehreren Benutzern wiederholen
  email: string;
  // Benutzerrolle: admin (voller Zugriff), instructor (Kursverwaltung), participant (Standard), trial (Schnupperteilnehmer)
  role: UserRole;
  // Benutzerspezifische Einstellungen, z. B. Benachrichtigungspräferenzen, flexibel für zukünftige Erweiterungen
  settings?: Record<string, unknown>;
}