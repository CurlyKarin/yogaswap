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
