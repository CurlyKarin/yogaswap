import type { CourseDateOverride } from "@shared/types";

export const courseDateOverrides: CourseDateOverride[] = [
  {
    courseId: 1,
    date: "2025-09-29",
    participants: ["Nova","Luna", "Skye", "Zoe", "Aria", "Rue", "Kai",  "Nia"],
    swapped: ["Kai"],
    waitlist: [],
  },
  {
    courseId: 6,
    date: "2025-10-02",
    participants: ["Aria", "Rue", "Skye" ],
    swapped: ["Skye"],
    waitlist: ["Kai", "Nia"],
  },
  {
    courseId: 4,
    date: "2025-10-01",
    participants: ["Luna", "Skye" ],
    swapped: [],
    waitlist: ["Nia"],
  }
];
  
