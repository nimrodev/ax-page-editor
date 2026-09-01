import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("says 'just now' for anything under 30 seconds old", () => {
    expect(relativeTime("2026-06-15T11:59:45.000Z", now)).toBe("just now");
  });

  it("counts seconds between 30 and 60", () => {
    expect(relativeTime("2026-06-15T11:59:15.000Z", now)).toBe("45 seconds ago");
  });

  it("uses singular phrasing for exactly one minute", () => {
    expect(relativeTime("2026-06-15T11:59:00.000Z", now)).toBe("a minute ago");
  });

  it("counts minutes under an hour", () => {
    expect(relativeTime("2026-06-15T11:45:00.000Z", now)).toBe("15 minutes ago");
  });

  it("uses singular phrasing for exactly one hour", () => {
    expect(relativeTime("2026-06-15T11:00:00.000Z", now)).toBe("an hour ago");
  });

  it("counts hours under a day", () => {
    expect(relativeTime("2026-06-15T06:00:00.000Z", now)).toBe("6 hours ago");
  });

  it("says 'yesterday' for exactly one day", () => {
    expect(relativeTime("2026-06-14T12:00:00.000Z", now)).toBe("yesterday");
  });

  it("counts days under a week", () => {
    expect(relativeTime("2026-06-12T12:00:00.000Z", now)).toBe("3 days ago");
  });

  it("falls back to a locale date for a week or older", () => {
    const then = "2026-05-01T12:00:00.000Z";
    expect(relativeTime(then, now)).toBe(new Date(then).toLocaleDateString());
  });
});
