import type { CourseDateOverride } from "../types";

export const courseDateOverrides: CourseDateOverride[] = [
  {
    courseId: 1,
    date: "2025-08-18",
    participants: ["Luna", "Nia"],
    swapped: ["Nia"]
  },
  {
    courseId: 6,
    date: "2025-08-28",
    participants: ["Aria", "Rue", "Skye" ],
    swapped: ["Skye"]
  },
  {
    courseId: 4,
    date: "2025-09-03",
    participants: ["Luna", "Skye" ],
    swapped: [],
    waitlist: ["Nia"]
  }
];
  
