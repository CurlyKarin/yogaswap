// export type User = {
//   nickname: string;
//   email: string;
//   password: string; // nur für lokalen Fake-Login
//   enrolledCourseIds: number[]; // in welchen Kursen ist der User?
// };

export type SwapSettings = {
  minOffsetDays: number; // frühestens X Tage nach Referenzdatum
  maxOffsetDays: number; // spätestens X Tage nach Referenzdatum
};

