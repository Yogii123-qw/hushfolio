import { describe, expect, it } from "vitest";
import { collectTags, filterPapersByTag, scorePaper, searchPapers, tokenizeQuery } from "../src/data/search";
import type { Paper } from "../src/types";

function makePaper(overrides: Partial<Paper>): Paper {
  return {
    id: "p1",
    title: "Untitled",
    body: "",
    tags: [],
    mood: "unknown",
    summary: null,
    sensitivity: null,
    photo: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("tokenizeQuery", () => {
  it("lowercases and splits on punctuation", () => {
    expect(tokenizeQuery("Trip-Planning, JUNE!")).toEqual(["trip", "planning", "june"]);
  });

  it("drops tokens shorter than 2 characters", () => {
    expect(tokenizeQuery("a I go")).toEqual(["go"]);
  });

  it("returns an empty list for an empty query", () => {
    expect(tokenizeQuery("   ")).toEqual([]);
  });
});

describe("scorePaper", () => {
  it("scores 0 with no tokens", () => {
    expect(scorePaper(makePaper({ title: "Trip" }), [])).toBe(0);
  });

  it("weights title matches above tag, summary, and body matches", () => {
    const titleOnly = scorePaper(makePaper({ title: "Harbor", body: "nothing here" }), ["harbor"]);
    const tagOnly = scorePaper(makePaper({ title: "Other", tags: ["harbor"] }), ["harbor"]);
    const summaryOnly = scorePaper(makePaper({ title: "Other", summary: "about the harbor" }), ["harbor"]);
    const bodyOnly = scorePaper(makePaper({ title: "Other", body: "the harbor was quiet" }), ["harbor"]);
    expect(titleOnly).toBe(10);
    expect(tagOnly).toBe(6);
    expect(summaryOnly).toBe(2);
    expect(bodyOnly).toBe(1);
    expect(titleOnly).toBeGreaterThan(tagOnly);
    expect(tagOnly).toBeGreaterThan(summaryOnly);
    expect(summaryOnly).toBeGreaterThan(bodyOnly);
  });

  it("gives a partial tag match less than an exact tag match", () => {
    const exact = scorePaper(makePaper({ tags: ["travel"] }), ["travel"]);
    const partial = scorePaper(makePaper({ tags: ["travel-notes"] }), ["travel"]);
    expect(exact).toBe(6);
    expect(partial).toBe(3);
  });
});

describe("searchPapers", () => {
  const papers = [
    makePaper({ id: "a", title: "Harbor morning", updatedAt: 3000 }),
    makePaper({ id: "b", title: "Notes", body: "the harbor was quiet", updatedAt: 2000 }),
    makePaper({ id: "c", title: "Groceries", updatedAt: 1000 }),
  ];

  it("orders by score, then recency", () => {
    expect(searchPapers(papers, "harbor").map((paper) => paper.id)).toEqual(["a", "b"]);
  });

  it("returns all papers in recency order for an empty query", () => {
    expect(searchPapers(papers, "  ").map((paper) => paper.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchPapers(papers, "zebra")).toEqual([]);
  });
});

describe("filterPapersByTag", () => {
  const papers = [
    makePaper({ id: "a", tags: ["work"] }),
    makePaper({ id: "b", tags: ["family"] }),
  ];

  it("returns all papers for a null or empty tag", () => {
    expect(filterPapersByTag(papers, null)).toHaveLength(2);
    expect(filterPapersByTag(papers, "")).toHaveLength(2);
  });

  it("filters to the exact tag", () => {
    expect(filterPapersByTag(papers, "work").map((paper) => paper.id)).toEqual(["a"]);
  });
});

describe("collectTags", () => {
  it("collects unique tags sorted alphabetically", () => {
    const papers = [makePaper({ tags: ["work", "family"] }), makePaper({ tags: ["work", "travel"] })];
    expect(collectTags(papers)).toEqual(["family", "travel", "work"]);
  });
});
