// Prompt templates, versioned. Only v1 exists today; an unknown version
// from Remote Config falls back to v1 and the fallback is logged, so a
// bad remote value can never produce a missing prompt.
//
// Every structured prompt instructs the model to return JSON ONLY with no
// markdown fences and no extra keys — belt and suspenders alongside the
// SDK-level response schema / response constraint.

import { logWarn } from "../platform/logging";
import type { Paper } from "../types";

export const KNOWN_PROMPT_VERSIONS = ["v1"] as const;

export function resolvePromptVersion(requested: string): string {
  if ((KNOWN_PROMPT_VERSIONS as readonly string[]).includes(requested)) {
    return requested;
  }
  logWarn("prompt_version_fallback", { requested, fallback: "v1" });
  return "v1";
}

const JSON_ONLY =
  "Respond with a single JSON object only. No markdown fences, no explanation outside the JSON, no extra keys.";

export function buildSummaryPrompt(body: string): string {
  return [
    "You file a private paper in a personal archive.",
    "Read the paper below and produce its filing record.",
    "The title must be short and specific. The summary must be at most two sentences.",
    "Tags must be single lowercase words or short phrases, at most 8.",
    "Mood must be one of: calm, tense, hopeful, low, mixed, unknown.",
    JSON_ONLY,
    "Paper:",
    body,
  ].join("\n\n");
}

export function buildSensitivityPrompt(body: string): string {
  return [
    "You scan a private paper for sensitive details. This scan runs only on the user's own device.",
    "PRIVACY RULE: never repeat a sensitive value verbatim in your output. " +
      "In redactedPreview, replace each sensitive span with a bracketed placeholder such as [NAME], [ADDRESS], [ID NUMBER], [ACCOUNT], [PHONE], [PASSWORD]. " +
      "Keep all other words exactly as written.",
    "Categories must come only from: names, addresses, id_numbers, financial, health, credentials, contact_details, other.",
    "Level rules: high = identity documents, financial account details, passwords, or health records are present. " +
      "low = names or contact details only. none = no sensitive details found.",
    "Notes must describe WHAT kinds of details were found, never their values.",
    JSON_ONLY,
    "Paper:",
    body,
  ].join("\n\n");
}

export function buildAskPrompt(body: string, question: string): string {
  return [
    "Answer the question using ONLY the paper below.",
    "If the paper does not contain the answer, say exactly: I cannot answer that from this paper.",
    "Do not invent facts. Do not use outside knowledge. Keep the answer short.",
    "Paper:",
    body,
    "Question:",
    question,
  ].join("\n\n");
}

export function buildPhotoPrompt(): string {
  return [
    "You read a photograph of a paper document.",
    "Transcribe all visible text faithfully into transcription. If no text is legible, transcription must be an empty string.",
    "Describe what the document is and its layout in description.",
    "docType must be one of: note, letter, receipt, form, other.",
    "confidence must be one of: high, medium, low, reflecting how legible the document is.",
    JSON_ONLY,
  ].join("\n\n");
}

export function buildConnectionsPrompt(papers: Paper[]): string {
  const listing = papers
    .map((paper, index) => `Paper ${index + 1} (titled "${paper.title}"):\n${paper.body}`)
    .join("\n\n---\n\n");
  return [
    "You find connections across several private papers from one person's archive.",
    "List at most 6 recurring themes, at most 8 pairwise connections, and at most 10 timeline entries.",
    "Every connection must name two paper titles exactly as given and explain the relation in one sentence.",
    "Timeline entries must only use dates or time references that appear in the papers themselves. Do not guess dates.",
    "Do not invent facts about the person. Only use what the papers say.",
    JSON_ONLY,
    listing,
  ].join("\n\n");
}
