import type { Course } from "../types";

// Beispielkurse (6+ pro Woche)
export const courses: Course[] = [
  { id: 1, name: "YogaMo",       weekday: "Mon", time: "19:30", capacity: 8, participants: ["Luna", "Nova", "Skye", "Zoe", "Maya", "Nia", "Rue", "Aria"], dates: [new Date(2025, 7, 11), new Date(2025, 7, 18), new Date(2025, 7, 25), new Date(2025, 8, 1), new Date(2025, 8, 8), new Date(2025, 8, 15), new Date(2025, 8, 22), new Date(2025, 8, 29), new Date(2025, 9, 6)] },
  { id: 2, name: "YogaDi",       weekday: "Tue", time: "18:30", capacity: 3, participants: ["Maya", "Zoe"], dates: [new Date(2025, 7, 12), new Date(2025, 7, 19), new Date(2025, 7, 26), new Date(2025, 8, 2), new Date(2025, 8, 9), new Date(2025, 8, 16), new Date(2025, 8, 23), new Date(2025, 8, 30), new Date(2025, 9, 7)] },
  { id: 3, name: "MiYoga",       weekday: "Wed", time: "17:15", capacity: 3, participants: ["Ivy", "Kai"], dates: [new Date(2025, 7, 13), new Date(2025, 7, 20), new Date(2025, 7, 27), new Date(2025, 8, 3), new Date(2025, 8, 10), new Date(2025, 8, 17), new Date(2025, 8, 24), new Date(2025, 8, 31), new Date(2025, 9, 8)] },
  { id: 4, name: "YogaMi",       weekday: "Wed", time: "19:30", capacity: 2, participants: ["Luna", "Skye"], dates: [new Date(2025, 7, 13), new Date(2025, 7, 20), new Date(2025, 7, 27), new Date(2025, 8, 3), new Date(2025, 8, 10), new Date(2025, 8, 17), new Date(2025, 8, 24), new Date(2025, 8, 31), new Date(2025, 9, 8)] },
  { id: 5, name: "DoYoga",       weekday: "Thu", time: "10:00", capacity: 3, participants: ["Zoe", "Nia"], dates: [new Date(2025, 7, 14), new Date(2025, 7, 21), new Date(2025, 7, 28), new Date(2025, 8, 4), new Date(2025, 8, 11), new Date(2025, 8, 18), new Date(2025, 8, 25), new Date(2025, 9, 1), new Date(2025, 9, 9)] },
  { id: 6, name: "YogaDo",       weekday: "Thu", time: "18:30", capacity: 3, participants: ["Aria", "Rue"], dates: [new Date(2025, 7, 14), new Date(2025, 7, 21), new Date(2025, 7, 28), new Date(2025, 8, 4), new Date(2025, 8, 11), new Date(2025, 8, 18), new Date(2025, 8, 25), new Date(2025, 9, 1), new Date(2025, 9, 9)] },
  { id: 7, name: "SaYoga",       weekday: "Sun", time: "11:00", capacity: 3, participants: [], dates: [new Date(2025, 7, 16), new Date(2025, 7, 23), new Date(2025, 7, 30), new Date(2025, 8, 6), new Date(2025, 8, 13), new Date(2025, 8, 20), new Date(2025, 8, 27), new Date(2025, 9, 3)] },
];

