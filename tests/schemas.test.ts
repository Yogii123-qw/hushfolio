import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import {
  connectionsZodSchema,
  parseStructuredOutput,
  photoZodSchema,
  sensitivityZodSchema,
  summaryZodSchema,
} from "../src/ai/schemas";

describe("summary schema", () => {
  const valid = { title: "Trip notes", summary: "We decided to go in June.", tags: ["travel"], mood: "hopeful" };

  it("accepts a valid summary", () => {
    expect(summaryZodSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an unknown mood", () => {
    expect(summaryZodSchema.safeParse({ ...valid, mood: "ecstatic" }).success).toBe(false);
  });

  it("rejects more than 8 tags", () => {
    expect(summaryZodSchema.safeParse({ ...valid, tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it("rejects a title longer than 200 characters", () => {
    expect(summaryZodSchema.safeParse({ ...valid, title: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts a title of exactly 200 characters", () => {
    expect(summaryZodSchema.safeParse({ ...valid, title: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects a summary longer than 2000 characters", () => {
    expect(summaryZodSchema.safeParse({ ...valid, summary: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(summaryZodSchema.safeParse({ ...valid, summary: "  " }).success).toBe(false);
  });
});

describe("sensitivity schema", () => {
  const valid = { level: "low", categories: ["names"], notes: "Names were found.", redactedPreview: "Met [NAME] today." };

  it("accepts a valid scan", () => {
    expect(sensitivityZodSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an unknown category", () => {
    expect(sensitivityZodSchema.safeParse({ ...valid, categories: ["passwords"] }).success).toBe(false);
  });

  it("accepts all documented categories", () => {
    const all = ["names", "addresses", "id_numbers", "financial", "health", "credentials", "contact_details", "other"];
    expect(sensitivityZodSchema.safeParse({ ...valid, categories: all }).success).toBe(true);
  });

  it("rejects notes longer than 1000 characters", () => {
    expect(sensitivityZodSchema.safeParse({ ...valid, notes: "x".repeat(1001) }).success).toBe(false);
  });

  it("rejects an unknown level", () => {
    expect(sensitivityZodSchema.safeParse({ ...valid, level: "critical" }).success).toBe(false);
  });
});

describe("connections schema", () => {
  const valid = {
    themes: ["family"],
    connections: [{ firstPaper: "A", secondPaper: "B", relation: "Both mention the house." }],
    timeline: [{ label: "June", detail: "The trip was planned." }],
  };

  it("accepts a valid analysis", () => {
    expect(connectionsZodSchema.parse(valid)).toEqual(valid);
  });

  it("rejects more than 6 themes", () => {
    expect(connectionsZodSchema.safeParse({ ...valid, themes: Array.from({ length: 7 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it("rejects more than 8 connections", () => {
    const connections = Array.from({ length: 9 }, (_, i) => ({ firstPaper: "A", secondPaper: "B", relation: `r${i}` }));
    expect(connectionsZodSchema.safeParse({ ...valid, connections }).success).toBe(false);
  });

  it("rejects a connection with an empty relation", () => {
    expect(
      connectionsZodSchema.safeParse({ ...valid, connections: [{ firstPaper: "A", secondPaper: "B", relation: " " }] }).success,
    ).toBe(false);
  });
});

describe("photo schema", () => {
  const valid = { transcription: "Dear Ana,", description: "A handwritten letter.", docType: "letter", confidence: "high" };

  it("accepts a valid photo read", () => {
    expect(photoZodSchema.parse(valid)).toEqual(valid);
  });

  it("accepts an empty transcription (illegible photo)", () => {
    expect(photoZodSchema.safeParse({ ...valid, transcription: "" }).success).toBe(true);
  });

  it("rejects an unknown document type", () => {
    expect(photoZodSchema.safeParse({ ...valid, docType: "passport" }).success).toBe(false);
  });

  it("rejects an empty description", () => {
    expect(photoZodSchema.safeParse({ ...valid, description: " " }).success).toBe(false);
  });
});

describe("parseStructuredOutput", () => {
  it("parses and validates JSON text", () => {
    const data = parseStructuredOutput(
      JSON.stringify({ title: "T", summary: "S", tags: [], mood: "calm" }),
      summaryZodSchema,
    );
    expect(data.title).toBe("T");
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseStructuredOutput("not json {", summaryZodSchema)).toThrow(AppError);
    try {
      parseStructuredOutput("not json {", summaryZodSchema);
    } catch (error) {
      expect((error as AppError).kind).toBe("model_output");
    }
  });

  it("reports field paths and codes, never received values", () => {
    const secretValue = "SECRET_VALUE_7f3a9c";
    try {
      parseStructuredOutput(JSON.stringify({ title: "T", summary: "S", tags: [], mood: secretValue }), summaryZodSchema);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).kind).toBe("model_output");
      expect((error as AppError).message).toContain("mood");
      expect((error as AppError).message).not.toContain(secretValue);
    }
  });
});
