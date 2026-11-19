// PREVIEW FIXTURE - stands in for src/data/ledger.ts in the preview
// bundle only. Never imported by production code.

import { FIXTURE_LEDGER } from "./data";

export async function recordLedgerRun() {}

export async function listLedgerPage() {
  return { entries: [...FIXTURE_LEDGER], nextCursor: null, hasMore: false, skippedMalformed: 0 };
}
