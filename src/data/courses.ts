import type { Course } from "../types";

// Beispielkurse (6+ pro Woche)
export const courses: Course[] = [
  { id: 1, name: "YogaMo",       weekday: "Mon", time: "19:30", capacity: 2, participants: ["Luna", "Nova"] },
  { id: 2, name: "YogaDi",       weekday: "Tue", time: "18:30", capacity: 2, participants: ["Maya", "Zoe"] },
  { id: 3, name: "MiYoga",       weekday: "Wed", time: "17:15", capacity: 2, participants: ["Ivy", "Kai"] },
  { id: 4, name: "YogaMi",       weekday: "Wed", time: "19:30", capacity: 2, participants: ["Luna", "Skye"] },
  { id: 5, name: "DoYoga",       weekday: "Thu", time: "10:00", capacity: 2, participants: ["Zoe", "Nia"] },
  { id: 6, name: "YogaDo",       weekday: "Thu", time: "18:30", capacity: 3, participants: ["Aria", "Rue"] },
  { id: 7, name: "SaYoga",       weekday: "Sun", time: "11:00", capacity: 3, participants: [] },
];
