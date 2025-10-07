import { Course } from "@shared/types";


// Beispielkurse (6+ pro Woche)
// export const courses: Course[] = [
//   { id: 1, name: "YogaMo",       weekday: "Mon", time: "19:30", capacity: 8, participants: ["Luna", "Nova", "Skye", "Zoe", "Maya", "Nia", "Rue", "Aria"], dates: [new Date (2025, 9, 6), new Date(2025, 9, 13), new Date(2025, 9, 20), new Date(2025, 9, 27), new Date(2025, 10, 3), new Date(2025, 10, 10), new Date(2025, 10, 17), new Date(2025, 10, 24), new Date(2025, 11, 1), new Date(2025, 11, 8), new Date(2025, 11, 15)] },
//   { id: 2, name: "YogaDi",       weekday: "Tue", time: "18:30", capacity: 3, participants: ["Maya", "Zoe"], dates: [new Date (2025, 9, 7), new Date(2025, 9, 14), new Date(2025, 9, 21), new Date(2025, 9, 28), new Date(2025, 10, 4), new Date(2025, 10, 11), new Date(2025, 10, 18), new Date(2025, 10, 25), new Date(2025, 11, 2), new Date(2025, 11, 9), new Date(2025, 11, 16)] },
//   { id: 3, name: "MiYoga",       weekday: "Wed", time: "17:15", capacity: 3, participants: ["Ivy", "Kai"], dates: [new Date(2025, 9, 8), new Date(2025, 9, 15), new Date(2025, 9, 22), new Date(2025, 9, 29), new Date(2025, 10, 5), new Date(2025, 10, 12), new Date(2025, 10, 19), new Date(2025, 10, 26), new Date(2025, 11, 3), new Date(2025, 11, 10), new Date(2025, 11, 17)] },
//   { id: 4, name: "YogaMi",       weekday: "Wed", time: "19:30", capacity: 2, participants: ["Luna", "Skye"], dates: [ new Date(2025, 9, 8), new Date(2025, 9, 15), new Date(2025, 9, 22), new Date(2025, 9, 29), new Date(2025, 10, 5), new Date(2025, 10, 12), new Date(2025, 10, 19), new Date(2025, 10, 26), new Date(2025, 11, 3), new Date(2025, 11, 10), new Date(2025, 11, 17)] },
//   { id: 5, name: "DoYoga",       weekday: "Thu", time: "10:00", capacity: 2, participants: ["Zoe", "Nia"], dates: [ new Date(2025, 9, 9), new Date(2025, 9, 16), new Date(2025, 9, 23), new Date(2025, 9, 30), new Date(2025, 10, 6), new Date(2025, 10, 13), new Date(2025, 10, 20), new Date(2025, 10, 27), new Date(2025, 11, 4), new Date(2025, 11, 11), new Date(2025, 11, 18)] },
//   { id: 6, name: "YogaDo",       weekday: "Thu", time: "18:30", capacity: 3, participants: ["Aria", "Rue"], dates: [new Date(2025, 9, 9), new Date(2025, 9, 16), new Date(2025, 9, 23), new Date(2025, 9, 30), new Date(2025, 10, 6), new Date(2025, 10, 13), new Date(2025, 10, 20), new Date(2025, 10, 27), new Date(2025, 11, 4), new Date(2025, 11, 11), new Date(2025, 11, 18)] },
//   { id: 7, name: "SaYoga",       weekday: "Sun", time: "11:00", capacity: 3, participants: [], dates: [new Date(2025, 9, 18), new Date(2025, 9, 25), new Date(2025, 10, 8), new Date(2025, 10, 15), new Date(2025, 10, 22), new Date(2025, 10, 29), new Date(2025, 11, 6), new Date(2025, 11, 13), new Date(2025, 11, 20)] },
// ];

export const courses: Course[] = [
  {
	id: 1, 
    name: "YogaMo",       
	weekday: "Mon", 
	time: "19:30", 
	capacity: 8, 
	participants: ["Luna", "Nova", "Skye", "Zoe", "Maya", "Nia", "Rue", "Aria"], 
    dates: ["2025-10-06","2025-10-13", "2025-10-20", "2025-10-27", "2025-11-03", "2025-11-10", "2025-11-17", "2025-11-24", "2025-12-01", "2025-12-08", "2025-12-15"], // ISO-Format
  },
  {
	id: 2, 
	name: "YogaDi",       
	weekday: "Tue", 
	time: "18:30", 
    capacity: 3, 
	participants: ["Maya", "Zoe"], 
    dates: ["2025-09-07", "2025-10-14", "2025-10-21", "2025-10-28", "2025-11-04", "2025-11-11", "2025-11-18", "2025-11-25", "2025-12-02", "2025-12-09", "2025-12-16"],
  },
  { 
    id: 3, 
    name: "MiYoga",       
    weekday: "Wed", 
    time: "17:15", 
    capacity: 3, 
    participants: ["Ivy", "Kai"], 
    dates: ["2025-09-08", "2025-10-15", "2025-10-22", "2025-10-29", "2025-11-05", "2025-11-12", "2025-11-19", "2025-11-26", "2025-12-03", "2025-12-10", "2025-12-17"]
 },
  { 
    id: 4, 
    name: "YogaMi",       
    weekday: "Wed", 
    time: "19:30", 
    capacity: 2, 
    participants: ["Luna", "Skye"], 
    dates: ["2025-09-08", "2025-10-15", "2025-10-22", "2025-10-29", "2025-11-05", "2025-11-12", "2025-11-19", "2025-11-26", "2025-12-03", "2025-12-10", "2025-12-17"]
  },
  { 
    id: 5, 
    name: "DoYoga",       
    weekday: "Thu", 
    time: "10:00", 
    capacity: 2, 
    participants: ["Zoe", "Nia"], 
    dates: ["2025-10-16", "2025-10-23", "2025-10-30", "2025-11-06", "2025-11-13", "2025-11-20", "2025-11-27", "2025-12-04", "2025-12-11", "2025-12-18"] 
  },
  { 
    id: 6, 
    name: "YogaDo",       
    weekday: "Thu", 
    time: "18:30", 
    capacity: 3, 
    participants: ["Aria", "Rue"], 
    dates: ["2025-10-16", "2025-10-23", "2025-10-30", "2025-11-06", "2025-11-13", "2025-11-20", "2025-11-27", "2025-12-04", "2025-12-11", "2025-12-18"] 
  },
  { id: 7, 
    name: "SaYoga",       
    weekday: "Sun", 
    time: "11:00", 
    capacity: 3, 
    participants: [], 
    dates: ["2025-10-11", "2025-10-18", "2025-10-25", "2025-11-08", "2025-11-15", "2025-11-22", "2025-11-29", "2025-12-06", "2025-12-13", "2025-12-20"] 
  },

];