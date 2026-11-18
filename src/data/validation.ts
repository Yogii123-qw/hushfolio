// Input validation for papers. Pure functions, fully unit-tested.
// Error messages name the field and the limit — never the submitted text.

import { z } from "zod";
import type { PaperInput } from "../types";

export const MAX_TITLE_CHARS = 200;
export const MAX_TAGS = 12;
export const MAX_TAG_CHARS = 32;
export const MAX_SUMMARY_CHARS = 2000;

const TAG_ALLOWED = /[^a-z0-9 _-]+/g;

/**
 * Normalize raw tags: lowercase, trim, strip disallowed characters,
 * collapse whitespace, drop empties, de-duplicate, cap the count.
 */
export function normalizeTags(rawTags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawTags) {
    const cleaned = raw
      .toLowerCase()
      .replace(TAG_ALLOWED, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TAG_CHARS)
      .trim();
    if (cleaned === "" || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= MAX_TAGS) {
      break;
    }
  }
  return out;
}

/** Split a comma-separated tag field into raw tag strings. */
export function splitTagField(field: string): string[] {
  return field
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export type PaperInputValidation =
  | { ok: true; value: PaperInput }
  | { ok: false; issues: string[] };

export function validatePaperInput(
  input: { title: string; body: string; tags: readonly string[] },
  maxPaperChars: number,
): PaperInputValidation {
  const schema = z.object({
    title: z.string().trim().min(1, "Title is required.").max(MAX_TITLE_CHARS),
    body: z.string().trim().min(1, "Body is required.").max(maxPaperChars),
    tags: z.array(z.string()).max(MAX_TAGS),
  });
  const candidate = {
    title: input.title,
    body: input.body,
    tags: normalizeTags(input.tags),
  };
  const result = schema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path[0] ?? "paper";
      if (issue.code === "too_big") {
        return `${String(field)} exceeds the allowed length.`;
      }
      if (issue.code === "too_small") {
        return `${String(field)} is required.`;
      }
      return `${String(field)} is invalid.`;
    });
    return { ok: false, issues };
  }
  return { ok: true, value: result.data };
}
