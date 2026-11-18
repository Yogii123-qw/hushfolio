// Client-side paper search: pure functions over the user's own papers.
// Scoring is transparent and deterministic: title matches weigh most,
// then tags and summary, then body text.

import type { Paper } from "../types";

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function scorePaper(paper: Paper, tokens: readonly string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const title = paper.title.toLowerCase();
  const summary = (paper.summary ?? "").toLowerCase();
  const body = paper.body.toLowerCase();
  const tags = paper.tags.map((tag) => tag.toLowerCase());
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) {
      score += 10;
    }
    if (tags.some((tag) => tag === token)) {
      score += 6;
    } else if (tags.some((tag) => tag.includes(token))) {
      score += 3;
    }
    if (summary.includes(token)) {
      score += 2;
    }
    if (body.includes(token)) {
      score += 1;
    }
  }
  return score;
}

export function searchPapers(papers: readonly Paper[], query: string): Paper[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return [...papers].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return papers
    .map((paper) => ({ paper, score: scorePaper(paper, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.paper.updatedAt - a.paper.updatedAt)
    .map((entry) => entry.paper);
}

export function filterPapersByTag(papers: readonly Paper[], tag: string | null): Paper[] {
  if (tag === null || tag === "") {
    return [...papers];
  }
  return papers.filter((paper) => paper.tags.includes(tag));
}

export function collectTags(papers: readonly Paper[]): string[] {
  const tags = new Set<string>();
  for (const paper of papers) {
    for (const tag of paper.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}
