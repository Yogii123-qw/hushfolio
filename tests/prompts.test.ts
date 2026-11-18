import { describe, expect, it } from "vitest";
import {
  buildAskPrompt,
  buildConnectionsPrompt,
  buildPhotoPrompt,
  buildSensitivityPrompt,
  buildSummaryPrompt,
  resolvePromptVersion,
} from "../src/ai/prompts";
import type { Paper } from "../src/types";

const JSON_ONLY = "Respond with a single JSON object only";

function makePaper(id: string, title: string, body: string): Paper {
  return {
    id,
    title,
    body,
    tags: [],
    mood: "unknown",
    summary: null,
    sensitivity: null,
    photo: null,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe("buildSummaryPrompt", () => {
  it("instructs JSON-only output and includes the paper", () => {
    const prompt = buildSummaryPrompt("BODY_MARKER_1");
    expect(prompt).toContain(JSON_ONLY);
    expect(prompt).toContain("BODY_MARKER_1");
    expect(prompt).toContain("calm, tense, hopeful, low, mixed, unknown");
  });
});

describe("buildSensitivityPrompt", () => {
  it("forbids verbatim sensitive values and requires bracketed placeholders", () => {
    const prompt = buildSensitivityPrompt("BODY_MARKER_2");
    expect(prompt).toContain("never repeat a sensitive value verbatim");
    expect(prompt).toContain("[NAME]");
    expect(prompt).toContain("[PASSWORD]");
    expect(prompt).toContain(JSON_ONLY);
    expect(prompt).toContain("BODY_MARKER_2");
  });

  it("names the exact category set", () => {
    const prompt = buildSensitivityPrompt("x");
    for (const category of ["names", "addresses", "id_numbers", "financial", "health", "credentials", "contact_details", "other"]) {
      expect(prompt).toContain(category);
    }
  });
});

describe("buildAskPrompt", () => {
  it("scopes the answer to the one paper and fixes the refusal sentence", () => {
    const prompt = buildAskPrompt("PAPER_MARKER", "QUESTION_MARKER");
    expect(prompt).toContain("using ONLY the paper below");
    expect(prompt).toContain("I cannot answer that from this paper.");
    expect(prompt).toContain("PAPER_MARKER");
    expect(prompt).toContain("QUESTION_MARKER");
    expect(prompt).not.toContain(JSON_ONLY);
  });
});

describe("buildPhotoPrompt", () => {
  it("requires JSON-only output with the documented enums", () => {
    const prompt = buildPhotoPrompt();
    expect(prompt).toContain(JSON_ONLY);
    expect(prompt).toContain("note, letter, receipt, form, other");
    expect(prompt).toContain("high, medium, low");
    expect(prompt).toContain("empty string");
  });
});

describe("buildConnectionsPrompt", () => {
  it("lists every paper with its exact title and body", () => {
    const prompt = buildConnectionsPrompt([
      makePaper("1", "Alpha Title", "ALPHA_BODY"),
      makePaper("2", "Beta Title", "BETA_BODY"),
    ]);
    expect(prompt).toContain('"Alpha Title"');
    expect(prompt).toContain("ALPHA_BODY");
    expect(prompt).toContain('"Beta Title"');
    expect(prompt).toContain("BETA_BODY");
    expect(prompt).toContain(JSON_ONLY);
  });

  it("caps the output and forbids invented dates", () => {
    const prompt = buildConnectionsPrompt([makePaper("1", "A", "x")]);
    expect(prompt).toContain("at most 6 recurring themes");
    expect(prompt).toContain("at most 8 pairwise connections");
    expect(prompt).toContain("at most 10 timeline entries");
    expect(prompt).toContain("Do not guess dates");
  });
});

describe("resolvePromptVersion", () => {
  it("keeps the known version v1", () => {
    expect(resolvePromptVersion("v1")).toBe("v1");
  });

  it("falls back to v1 for unknown versions", () => {
    expect(resolvePromptVersion("v2")).toBe("v1");
    expect(resolvePromptVersion("")).toBe("v1");
  });
});
