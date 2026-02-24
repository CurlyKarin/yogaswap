import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCourses } from "./courses";
import axios from "axios";

vi.mock("axios");

describe("getCourses", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
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
          participants: ["alice"],
          dates: ["2025-06-16"],
        },
      ],
    });

    const result = await getCourses();

    expect(axios.get).toHaveBeenCalledWith("/courses");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1,
      name: "Yoga Basics",
      weekday: "Mon",
      time: "18:30",
      capacity: 10,
      participants: ["alice"],
      dates: ["2025-06-16"],
    });
  });

  it("ersetzt fehlende participants/dates durch leere Arrays", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [{ id: 2, name: "Flow", weekday: "Tue", time: "10:00", capacity: 8 }],
    });

    const result = await getCourses();

    expect(result[0].participants).toEqual([]);
    expect(result[0].dates).toEqual([]);
  });

  it("gibt leeres Array zurück bei Fehler", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network error"));

    const result = await getCourses();

    expect(result).toEqual([]);
  });
});
