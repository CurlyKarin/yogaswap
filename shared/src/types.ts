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