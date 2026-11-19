// Structured-output contracts: one Firebase `Schema` per AI action (used
// as the cloud `responseSchema` and the on-device `responseConstraint`),
// mirrored by a zod schema that validates the parsed JSON at runtime.
// The two definitions are kept side by side so drift is visible in review.

import { Schema } from "firebase/ai";
import { z } from "zod";
import { AppError } from "../errors";

export const SENSITIVITY_CATEGORIES = [
  "names",
  "addresses",
  "id_numbers",
  "financial",
  "health",
  "credentials",
  "contact_details",
  "other",
] as const;

export type SensitivityCategory = (typeof SENSITIVITY_CATEGORIES)[number];

export const PHOTO_DOC_TYPES = ["note", "letter", "receipt", "form", "other"] as const;
export const PHOTO_CONFIDENCES = ["high", "medium", "low"] as const;

// --- Summarize & file -------------------------------------------------------

export const summaryFirebaseSchema = Schema.object({
  properties: {
    title: Schema.string(),
    summary: Schema.string(),
    tags: Schema.array({ items: Schema.string() }),
    mood: Schema.enumString({ enum: ["calm", "tense", "hopeful", "low", "mixed", "unknown"] }),
  },
});

export const summaryZodSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(32)).max(8),
  mood: z.enum(["calm", "tense", "hopeful", "low", "mixed", "unknown"]),
});

export type SummaryResult = z.infer<typeof summaryZodSchema>;

// --- Seal Scan --------------------------------------------------------------

export const sensitivityFirebaseSchema = Schema.object({
  properties: {
    level: Schema.enumString({ enum: ["none", "low", "high"] }),
    categories: Schema.array({
      items: Schema.enumString({ enum: [...SENSITIVITY_CATEGORIES] }),
    }),
    notes: Schema.string(),
    redactedPreview: Schema.string(),
  },
});

export const sensitivityZodSchema = z.object({
  level: z.enum(["none", "low", "high"]),
  categories: z.array(z.enum(SENSITIVITY_CATEGORIES)).max(8),
  notes: z.string().trim().max(1000),
  redactedPreview: z.string().trim().max(4000),
});

export type SensitivityResult = z.infer<typeof sensitivityZodSchema>;

// --- Connect the dots -------------------------------------------------------

export const connectionsFirebaseSchema = Schema.object({
  properties: {
    themes: Schema.array({ items: Schema.string() }),
    connections: Schema.array({
      items: Schema.object({
        properties: {
          firstPaper: Schema.string(),
          secondPaper: Schema.string(),
          relation: Schema.string(),
        },
      }),
    }),
    timeline: Schema.array({
      items: Schema.object({
        properties: {
          label: Schema.string(),
          detail: Schema.string(),
        },
      }),
    }),
  },
});

export const connectionsZodSchema = z.object({
  themes: z.array(z.string().trim().min(1).max(120)).max(6),
  connections: z
    .array(
      z.object({
        firstPaper: z.string().trim().min(1).max(200),
        secondPaper: z.string().trim().min(1).max(200),
        relation: z.string().trim().min(1).max(400),
      }),
    )
    .max(8),
  timeline: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        detail: z.string().trim().min(1).max(400),
      }),
    )
    .max(10),
});

export type ConnectionsResult = z.infer<typeof connectionsZodSchema>;

// --- Photo read -------------------------------------------------------------

export const photoFirebaseSchema = Schema.object({
  properties: {
    transcription: Schema.string(),
    description: Schema.string(),
    docType: Schema.enumString({ enum: [...PHOTO_DOC_TYPES] }),
    confidence: Schema.enumString({ enum: [...PHOTO_CONFIDENCES] }),
  },
});

export const photoZodSchema = z.object({
  transcription: z.string().trim().max(6000),
  description: z.string().trim().min(1).max(2000),
  docType: z.enum(PHOTO_DOC_TYPES),
  confidence: z.enum(PHOTO_CONFIDENCES),
});

export type PhotoResult = z.infer<typeof photoZodSchema>;

// --- Parsing ----------------------------------------------------------------

/**
 * Parse model text output as JSON and validate it. Failures are reported
 * with field paths and issue codes only - never with received values, so
 * model output (which may contain user content) is never echoed into logs
 * or error surfaces.
 */
export function parseStructuredOutput<T>(text: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new AppError(
      "model_output",
      "The model returned text that is not valid JSON, so the result was discarded.",
      "Try the action again. Nothing was saved from this run.",
    );
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`)
      .join("; ");
    throw new AppError(
      "model_output",
      `The model returned JSON that does not match the expected shape (${issues}), so the result was discarded.`,
      "Try the action again. Nothing was saved from this run.",
    );
  }
  return result.data;
}
