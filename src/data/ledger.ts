// Firestore access for the inference ledger. Entries are append-only
// audit records (the security rules forbid updates and deletes) and store
// metadata only - never prompts or model outputs.

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { toAppError } from "../errors";
import { logWarn } from "../platform/logging";
import type { ActionId, InferenceModeValue, InferenceSourceValue, LedgerEntry } from "../types";

export interface LedgerWrite {
  action: ActionId;
  requestedMode: InferenceModeValue;
  inferenceSource: InferenceSourceValue;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
  paperId: string | null;
}

function ledgerCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "ledger");
}

export async function recordLedgerRun(db: Firestore, uid: string, entry: LedgerWrite): Promise<void> {
  try {
    await addDoc(ledgerCollection(db, uid), {
      action: entry.action,
      requestedMode: entry.requestedMode,
      inferenceSource: entry.inferenceSource,
      durationMs: Number.isFinite(entry.durationMs) && entry.durationMs >= 0 ? Math.round(entry.durationMs) : 0,
      ok: entry.ok,
      errorCode: entry.errorCode,
      paperId: entry.paperId,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw toAppError(error, "Recording the ledger entry failed");
  }
}

function ledgerFromDoc(snapshot: QueryDocumentSnapshot<DocumentData>): LedgerEntry | null {
  const data = snapshot.data();
  const action = data["action"];
  const requestedMode = data["requestedMode"];
  const inferenceSource = data["inferenceSource"];
  const durationMs = data["durationMs"];
  const ok = data["ok"];
  if (
    typeof action !== "string" ||
    typeof requestedMode !== "string" ||
    typeof inferenceSource !== "string" ||
    typeof durationMs !== "number" ||
    typeof ok !== "boolean"
  ) {
    return null;
  }
  const createdAt = data["createdAt"];
  const createdAtMillis =
    typeof createdAt === "object" &&
    createdAt !== null &&
    "toMillis" in createdAt &&
    typeof (createdAt as { toMillis: unknown }).toMillis === "function"
      ? (createdAt as { toMillis: () => number }).toMillis()
      : 0;
  return {
    id: snapshot.id,
    action: action as ActionId,
    requestedMode: requestedMode as InferenceModeValue,
    inferenceSource: inferenceSource as InferenceSourceValue,
    durationMs,
    ok,
    errorCode: typeof data["errorCode"] === "string" ? (data["errorCode"] as string) : null,
    paperId: typeof data["paperId"] === "string" ? (data["paperId"] as string) : null,
    createdAt: createdAtMillis,
  };
}

export interface LedgerPage {
  entries: LedgerEntry[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  skippedMalformed: number;
}

export async function listLedgerPage(
  db: Firestore,
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<LedgerPage> {
  try {
    const base = query(ledgerCollection(db, uid), orderBy("createdAt", "desc"), limit(pageSize + 1));
    const paged = cursor !== null ? query(base, startAfter(cursor)) : base;
    const snapshot = await getDocs(paged);
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const entries: LedgerEntry[] = [];
    let skippedMalformed = 0;
    for (const docSnap of pageDocs) {
      const entry = ledgerFromDoc(docSnap);
      if (entry === null) {
        skippedMalformed += 1;
      } else {
        entries.push(entry);
      }
    }
    if (skippedMalformed > 0) {
      logWarn("ledger_malformed_skipped", { count: skippedMalformed });
    }
    const lastDoc = pageDocs[pageDocs.length - 1] ?? null;
    return { entries, nextCursor: hasMore ? lastDoc : null, hasMore, skippedMalformed };
  } catch (error) {
    throw toAppError(error, "Loading the ledger failed");
  }
}
