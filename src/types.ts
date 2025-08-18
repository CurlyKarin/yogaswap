export type User = {
  nickname: string;
  email: string;
  password: string; // nur für lokalen Fake-Login
  enrolledCourseIds: number[]; // in welchen Kursen ist der User?
};

export type Course = {
  id: number;
  name: string;
  weekday: string; // z.B. "Mon", "Tue", ...
  time: string;    // z.B. "18:30"
  capacity: number;
  participants: string[]; // Nicknames
  dates: Date[]; // Liste der Termine
};

export type CourseDateOverride = {
  courseId: number;
  date: string; // ISO-String
  participants: string[];
  swapped?: string[];
};

export type SwapSettings = {
  minOffsetDays: number; // frühestens X Tage nach Referenzdatum
  maxOffsetDays: number; // spätestens X Tage nach Referenzdatum
};
