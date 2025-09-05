import type { CourseDateOverride } from "../types";

export const courseDateOverrides: CourseDateOverride[] = [
  {
    courseId: 1,
    date: "2025-08-18",
    participants: ["Luna", "Nia"],
    swapped: ["Nia"],
    waitlist: [],
  },
  {
    courseId: 6,
    date: "2025-09-11",
    participants: ["Aria", "Rue", "Skye" ],
    swapped: ["Skye"],
    waitlist: ["Kai", "Nia"],
  },
  {
    courseId: 4,
    date: "2025-09-10",
    participants: ["Luna", "Skye" ],
    swapped: [],
    waitlist: ["Nia"],
  }
];
  
