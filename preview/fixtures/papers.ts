// PREVIEW FIXTURE — stands in for src/data/papers.ts in the preview
// bundle only. Returns sample data so views can be rendered for layout
// review. Never imported by production code.

import { FIXTURE_PAPERS } from "./data";

export const SEARCH_FETCH_CAP = 200;

export async function listPapersPage() {
  return { papers: [...FIXTURE_PAPERS], nextCursor: null, hasMore: false, skippedMalformed: 0 };
}

export async function getPaper(_db: unknown, _uid: string, paperId: string) {
  return FIXTURE_PAPERS.find((paper) => paper.id === paperId) ?? null;
}

export async function createPaper() {
  return "paper-preview-new";
}

export async function updatePaper() {}

export async function deletePaper() {}

export async function fetchPapersForSearch() {
  return { papers: [...FIXTURE_PAPERS], truncated: false, skippedMalformed: 0 };
}
