import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCourse, deleteCourse, getCourses, updateCourse } from "./courses";
import axios from "axios";

vi.mock("axios");

describe("getCourses", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.delete).mockReset();
  });

  it("gibt gemappte Course-Liste zurück bei erfolgreicher Antwort", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        {
          id: 1,
          name: "Yoga Basics",
          weekday: "Mon",
          time: "18:30",
          capacity: 10,
          status: "draft",
          participants: ["alice"],
          dates: ["2025-06-16"],
          visibleDates: ["2025-06-23"],
          planningMode: "bounded_series",
          visibilityMode: "fixed_window",
        },
      ],
    });

    const result = await getCourses();

    expect(axios.get).toHaveBeenCalledWith("/courses");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 1,
        name: "Yoga Basics",
        weekday: "Mon",
        time: "18:30",
        capacity: 10,
        status: "draft",
        planningMode: "bounded_series",
        visibilityMode: "fixed_window",
        visibleDates: ["2025-06-23"],
        participants: ["alice"],
        dates: ["2025-06-23"],
      }),
    );
  });

  it("ersetzt fehlende participants/dates durch leere Arrays", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [{ id: 2, name: "Flow", weekday: "Tue", time: "10:00", capacity: 8 }],
    });

    const result = await getCourses();

    expect(result[0].status).toBe("active");
    expect(result[0].participants).toEqual([]);
    expect(result[0].dates).toEqual([]);
  });

  it("gibt leeres Array zurück bei Fehler", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network error"));

    const result = await getCourses();

    expect(result).toEqual([]);
  });

  it("legt Kurs an", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        id: 3,
        name: "Core",
        weekday: "Wed",
        time: "19:00",
        capacity: 14,
        status: "draft",
        participants: [],
        dates: [],
      },
    });

    const result = await createCourse({
      name: "Core",
      weekday: "Wed",
      time: "19:00",
      capacity: 14,
      status: "draft",
    });

    expect(axios.post).toHaveBeenCalledWith("/courses", {
      name: "Core",
      weekday: "Wed",
      time: "19:00",
      capacity: 14,
      status: "draft",
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 3,
        name: "Core",
        weekday: "Wed",
        time: "19:00",
        capacity: 14,
        status: "draft",
        participants: [],
        dates: [],
      }),
    );
  });

  it("bearbeitet Kurs", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({
      data: {
        id: 1,
        name: "Yoga Flow",
        weekday: "Tue",
        time: "18:00",
        capacity: 16,
        status: "active",
        participants: ["luna"],
        dates: ["2026-04-15"],
      },
    });

    const result = await updateCourse(1, { status: "active", capacity: 16 });

    expect(axios.put).toHaveBeenCalledWith("/courses/1", {
      status: "active",
      capacity: 16,
    });
    expect(result.status).toBe("active");
    expect(result.capacity).toBe(16);
  });

  it("löscht Kurs", async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({
      data: { success: true, courseId: "1" },
    });

    const result = await deleteCourse(1);

    expect(axios.delete).toHaveBeenCalledWith("/courses/1");
    expect(result).toEqual({ success: true, courseId: "1" });
  });
});
