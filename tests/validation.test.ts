import { describe, expect, it } from "vitest";
import { normalizeTags, splitTagField, validatePaperInput } from "../src/data/validation";

describe("normalizeTags", () => {
  it("lowercases, trims, and strips disallowed characters", () => {
    expect(normalizeTags(["  Travel! ", "FAMILY&friends"])).toEqual(["travel", "family friends"]);
  });

  it("collapses inner whitespace", () => {
    expect(normalizeTags(["my   journal   entry"])).toEqual(["my journal entry"]);
  });

  it("drops empties and de-duplicates", () => {
    expect(normalizeTags(["", "  ", "work", "Work", "work"])).toEqual(["work"]);
  });

  it("caps at 12 tags", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(normalizeTags(tags)).toHaveLength(12);
  });

  it("truncates a tag to 32 characters", () => {
    expect(normalizeTags(["a".repeat(50)])[0]).toHaveLength(32);
  });

  it("keeps hyphens and underscores", () => {
    expect(normalizeTags(["well-being", "to_do"])).toEqual(["well-being", "to_do"]);
  });
});

describe("splitTagField", () => {
  it("splits on commas and drops empty parts", () => {
    expect(splitTagField("a, b ,,c ")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for an empty field", () => {
    expect(splitTagField("")).toEqual([]);
    expect(splitTagField(" , , ")).toEqual([]);
  });
});

describe("validatePaperInput", () => {
  it("accepts a valid paper and normalizes its tags", () => {
    const result = validatePaperInput({ title: "  Notes  ", body: "Hello.", tags: ["Work", "work"] }, 20000);
    expect(result).toEqual({ ok: true, value: { title: "Notes", body: "Hello.", tags: ["work"] } });
  });

  it("rejects an empty title", () => {
    const result = validatePaperInput({ title: "   ", body: "Hello.", tags: [] }, 20000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/title/i);
  });

  it("rejects an empty body", () => {
    const result = validatePaperInput({ title: "T", body: "   ", tags: [] }, 20000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/body/i);
  });

  it("rejects a title over 200 characters", () => {
    const result = validatePaperInput({ title: "x".repeat(201), body: "Hello.", tags: [] }, 20000);
    expect(result.ok).toBe(false);
  });

  it("accepts a title of exactly 200 characters", () => {
    const result = validatePaperInput({ title: "x".repeat(200), body: "Hello.", tags: [] }, 20000);
    expect(result.ok).toBe(true);
  });

  it("enforces the configured body limit", () => {
    expect(validatePaperInput({ title: "T", body: "x".repeat(1000), tags: [] }, 1000).ok).toBe(true);
    expect(validatePaperInput({ title: "T", body: "x".repeat(1001), tags: [] }, 1000).ok).toBe(false);
  });

  it("never echoes submitted content in its issues", () => {
    const secret = "SECRET_BODY_9d2e";
    const result = validatePaperInput({ title: "T", body: `${secret} ${"x".repeat(20000)}`, tags: [] }, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).not.toContain(secret);
  });
});
