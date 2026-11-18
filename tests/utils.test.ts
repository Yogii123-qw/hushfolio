import { describe, expect, it } from "vitest";
import { formatDateTime, formatDuration, truncateText } from "../src/utils";

describe("formatDateTime", () => {
  it("reports an unknown date for non-positive values", () => {
    expect(formatDateTime(0)).toBe("Unknown date");
    expect(formatDateTime(-5)).toBe("Unknown date");
  });

  it("formats a real timestamp with date and time parts", () => {
    const formatted = formatDateTime(1700000000000);
    expect(formatted).toMatch(/2023/);
    expect(formatted.length).toBeGreaterThan(8);
  });
});

describe("formatDuration", () => {
  it("shows milliseconds below one second", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(999)).toBe("999 ms");
  });

  it("shows seconds with one decimal at or above one second", () => {
    expect(formatDuration(1000)).toBe("1.0 s");
    expect(formatDuration(2340)).toBe("2.3 s");
  });
});

describe("truncateText", () => {
  it("leaves short text unchanged", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("truncates long text with an ellipsis", () => {
    expect(truncateText("hello world", 5)).toBe("hello…");
  });

  it("trims trailing space before the ellipsis", () => {
    expect(truncateText("hello world", 6)).toBe("hello…");
  });
});
