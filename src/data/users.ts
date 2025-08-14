import type { User } from "../types";

export const users: User[] = [
  { nickname: "Luna", email: "luna@example.com", password: "1234", enrolledCourseIds: [1, 4] },
  { nickname: "Maya", email: "maya@example.com", password: "5678", enrolledCourseIds: [2] },
  { nickname: "Ivy", email: "ivy@example.com", password: "1111", enrolledCourseIds: [3] },
  { nickname: "Nova", email: "nova@example.com", password: "2222", enrolledCourseIds: [1] },
  { nickname: "Zoe", email: "zoe@example.com", password: "3333", enrolledCourseIds: [2, 5] },
  { nickname: "Aria", email: "aria@example.com", password: "4444", enrolledCourseIds: [6] },
  { nickname: "Skye", email: "skye@example.com", password: "5555", enrolledCourseIds: [4] },
  { nickname: "Nia", email: "nia@example.com", password: "6666", enrolledCourseIds: [5] },
  { nickname: "Kai", email: "kai@example.com", password: "7777", enrolledCourseIds: [3] },
  { nickname: "Rue", email: "rue@example.com", password: "8888", enrolledCourseIds: [6] },
];
