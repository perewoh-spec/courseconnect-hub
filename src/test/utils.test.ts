import { describe, expect, it } from "vitest";
import { errorMessage, formatTime, toMinutes } from "@/lib/utils";

describe("formatTime", () => {
  it("drops seconds", () => {
    expect(formatTime("09:30:00")).toBe("09:30");
    expect(formatTime("14:05")).toBe("14:05");
  });
  it("handles empty values", () => {
    expect(formatTime(null)).toBe("");
  });
});

describe("toMinutes", () => {
  it("converts times to minutes since midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("10:30:00")).toBe(630);
    expect(toMinutes("18:45")).toBe(1125);
  });
});

describe("errorMessage", () => {
  it("reads Error and Supabase-style errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "Missing prerequisites: CS101" })).toBe("Missing prerequisites: CS101");
    expect(errorMessage(undefined)).toBe("Something went wrong");
  });
});
