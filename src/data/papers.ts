// Firestore access for papers. All reads convert timestamps to epoch
// milliseconds; all writes go through validation first. Malformed documents
// (wrong field types) are skipped in list results and counted, never
// rendered as if they were valid.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { AppError, toAppError } from "../errors";
import { logWarn } from "../platform/logging";
import type { Mood, Paper, PaperInput, PhotoMeta, SensitivityInfo } from "../types";
import { MOODS } from "../types";
import { validatePaperInput } from "./validation";

export const SEARCH_FETCH_CAP = 200;

function papersCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "papers");
}

function timestampToMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") {
      // Call it as a method of `value`, never detached: the real Firestore
      // Timestamp.toMillis reads `this.seconds`, so `const f = ts.toMillis;
      // f()` throws "cannot read properties of undefined (reading 'seconds')"
      // and breaks every paper read (live bug, 19 Nov 2026).
      const result = (value as { toMillis(): unknown }).toMillis();
      if (typeof result === "number") {
        return result;
      }
    }
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSensitivity(value: unknown): SensitivityInfo | null {
  if (!isRecord(value)) {
    return null;
  }
  const level = value["level"];
  const categories = value["categories"];
  const notes = value["notes"];
  const redactedPreview = value["redactedPreview"];
  const scannedAt = value["scannedAt"];
  const scannedOnDevice = value["scannedOnDevice"];
  if (
    (level !== "none" && level !== "low" && level !== "high") ||
    !Array.isArray(categories) ||
    !categories.every((item) => typeof item === "string") ||
    typeof notes !== "string" ||
    typeof redactedPreview !== "string" ||
    typeof scannedOnDevice !== "boolean"
  ) {
    return null;
  }
  return {
    level,
    categories: [...categories],
    notes,
    redactedPreview,
    scannedAt: timestampToMillis(scannedAt),
    scannedOnDevice,
  };
}

function readPhoto(value: unknown): PhotoMeta | null {
  if (!isRecord(value)) {
    return null;
  }
  const { name, mimeType, width, height, readAt } = value;
  if (
    typeof name !== "string" ||
    (mimeType !== "image/jpeg" && mimeType !== "image/png") ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  return { name, mimeType, width, height, readAt: timestampToMillis(readAt) };
}

/** Strict reader: returns null for documents that fail required-field checks. */
export function paperFromDoc(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
): Paper | null {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  const title = data["title"];
  const body = data["body"];
  const tags = data["tags"];
  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    !Array.isArray(tags) ||
    !tags.every((tag) => typeof tag === "string")
  ) {
    return null;
  }
  const moodRaw = data["mood"];
  const mood: Mood =
    typeof moodRaw === "string" && (MOODS as readonly string[]).includes(moodRaw)
      ? (moodRaw as Mood)
      : "unknown";
  const summaryRaw = data["summary"];
  return {
    id: snapshot.id,
    title,
    body,
    tags: [...tags],
    mood,
    summary: typeof summaryRaw === "string" ? summaryRaw : null,
    sensitivity: readSensitivity(data["sensitivity"]),
    photo: readPhoto(data["photo"]),
    createdAt: timestampToMillis(data["createdAt"]),
    updatedAt: timestampToMillis(data["updatedAt"]),
  };
}

export interface PaperPage {
  papers: Paper[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  skippedMalformed: number;
}

export async function listPapersPage(
  db: Firestore,
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<PaperPage> {
  try {
    const base = query(papersCollection(db, uid), orderBy("updatedAt", "desc"), limit(pageSize + 1));
    const paged = cursor !== null ? query(base, startAfter(cursor)) : base;
    const snapshot = await getDocs(paged);
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const papers: Paper[] = [];
    let skippedMalformed = 0;
    for (const docSnap of pageDocs) {
      const paper = paperFromDoc(docSnap);
      if (paper === null) {
        skippedMalformed += 1;
      } else {
        papers.push(paper);
      }
    }
    if (skippedMalformed > 0) {
      logWarn("papers_malformed_skipped", { count: skippedMalformed });
    }
    const lastDoc = pageDocs[pageDocs.length - 1] ?? null;
    return { papers, nextCursor: hasMore ? lastDoc : null, hasMore, skippedMalformed };
  } catch (error) {
    throw toAppError(error, "Loading papers failed");
  }
}

export async function getPaper(db: Firestore, uid: string, paperId: string): Promise<Paper | null> {
  try {
    const snapshot = await getDoc(doc(db, "users", uid, "papers", paperId));
    return paperFromDoc(snapshot);
  } catch (error) {
    throw toAppError(error, "Loading this paper failed");
  }
}

export async function createPaper(
  db: Firestore,
  uid: string,
  input: PaperInput,
  maxPaperChars: number,
): Promise<string> {
  const validated = validatePaperInput(input, maxPaperChars);
  if (!validated.ok) {
    throw new AppError("validation", validated.issues.join(" "), "Fix the highlighted fields and try again.");
  }
  try {
    const ref = await addDoc(papersCollection(db, uid), {
      title: validated.value.title,
      body: validated.value.body,
      tags: validated.value.tags,
      mood: "unknown",
      summary: null,
      sensitivity: null,
      photo: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    throw toAppError(error, "Saving the paper failed");
  }
}

export async function updatePaper(
  db: Firestore,
  uid: string,
  paperId: string,
  patch: Partial<{
    title: string;
    body: string;
    tags: string[];
    mood: Mood;
    summary: string | null;
    sensitivity: SensitivityInfo | null;
    photo: PhotoMeta | null;
  }>,
  maxPaperChars: number,
): Promise<void> {
  // Validate only the fields being changed; untouched fields keep their
  // stored values and are not re-validated against dummy data.
  const issues: string[] = [];
  if (patch.title !== undefined && (patch.title.trim() === "" || patch.title.trim().length > 200)) {
    issues.push("Title must be between 1 and 200 characters.");
  }
  if (patch.body !== undefined && (patch.body.trim() === "" || patch.body.trim().length > maxPaperChars)) {
    issues.push(`Body must be between 1 and ${maxPaperChars} characters.`);
  }
  if (patch.tags !== undefined && patch.tags.length > 12) {
    issues.push("At most 12 tags are allowed.");
  }
  if (issues.length > 0) {
    throw new AppError("validation", issues.join(" "), "Fix the highlighted fields and try again.");
  }
  try {
    await updateDoc(doc(db, "users", uid, "papers", paperId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toAppError(error, "Updating the paper failed");
  }
}

export async function deletePaper(db: Firestore, uid: string, paperId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "users", uid, "papers", paperId));
  } catch (error) {
    throw toAppError(error, "Deleting the paper failed");
  }
}

export interface SearchFetchResult {
  papers: Paper[];
  truncated: boolean;
  skippedMalformed: number;
}

/** Fetch papers for client-side search, up to a documented cap. */
export async function fetchPapersForSearch(
  db: Firestore,
  uid: string,
  cap: number = SEARCH_FETCH_CAP,
): Promise<SearchFetchResult> {
  const papers: Paper[] = [];
  let skippedMalformed = 0;
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let truncated = false;
  while (papers.length < cap) {
    const page = await listPapersPage(db, uid, Math.min(50, cap - papers.length), cursor);
    papers.push(...page.papers);
    skippedMalformed += page.skippedMalformed;
    if (!page.hasMore || page.nextCursor === null) {
      break;
    }
    cursor = page.nextCursor;
    if (papers.length >= cap) {
      truncated = true;
    }
  }
  return { papers, truncated, skippedMalformed };
}
