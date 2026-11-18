import { describe, expect, it } from "vitest";
import { downloadTextFile, exportFilename, papersToJson, papersToMarkdown } from "../src/data/export";
import type { Paper } from "../src/types";

const PAPER: Paper = {
  id: "p1",
  title: "Harbor morning",
  body: "The harbor was quiet.\nWe left at dawn.",
  tags: ["travel"],
  mood: "calm",
  summary: "A quiet morning at the harbor.",
  sensitivity: {
    level: "low",
    categories: ["names"],
    notes: "Names were found.",
    redactedPreview: "Met [NAME] at dawn.",
    scannedAt: 1700000000000,
    scannedOnDevice: true,
  },
  photo: null,
  createdAt: 1700000000000,
  updatedAt: 1700000100000,
};

describe("papersToJson", () => {
  it("produces parseable JSON with the paper data and ISO dates", () => {
    const parsed = JSON.parse(papersToJson([PAPER])) as {
      exportedAt: string;
      papers: Array<Record<string, unknown>>;
    };
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.papers).toHaveLength(1);
    expect(parsed.papers[0]?.["title"]).toBe("Harbor morning");
    expect(parsed.papers[0]?.["createdAt"]).toBe("2023-11-14T22:13:20.000Z");
  });

  it("never includes the Firestore document id or account identifiers", () => {
    const json = papersToJson([PAPER]);
    expect(json).not.toContain('"id"');
    expect(json).not.toContain("p1");
  });

  it("handles an empty archive", () => {
    const parsed = JSON.parse(papersToJson([])) as { papers: unknown[] };
    expect(parsed.papers).toEqual([]);
  });
});

describe("papersToMarkdown", () => {
  it("renders headings, summary, body, and separators", () => {
    const markdown = papersToMarkdown([PAPER]);
    expect(markdown).toContain("# Harbor morning");
    expect(markdown).toContain("Summary: A quiet morning at the harbor.");
    expect(markdown).toContain("The harbor was quiet.");
    expect(markdown).toContain("Tags: travel");
    expect(markdown).toContain("---");
  });

  it("renders an empty string for an empty archive", () => {
    expect(papersToMarkdown([])).toBe("");
  });
});

describe("exportFilename", () => {
  it("builds a timestamped filename with the requested extension", () => {
    const name = exportFilename("json", new Date("2026-11-19T00:30:00.000Z"));
    expect(name).toBe("hushfolio-export-2026-11-19T00-30.json");
    expect(exportFilename("md", new Date("2026-11-19T00:30:00.000Z"))).toBe("hushfolio-export-2026-11-19T00-30.md");
  });

  it("contains no colons or spaces", () => {
    expect(exportFilename("json", new Date())).not.toMatch(/[: ]/);
  });
});

describe("downloadTextFile", () => {
  it("is a browser-only helper and is not exercised in node", () => {
    expect(typeof downloadTextFile).toBe("function");
  });
});
