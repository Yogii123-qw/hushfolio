// Firestore access for papers. All reads convert timestamps to epoch
// milliseconds; all writes go through validation first. Malformed documents
// (wrong field types) are skipped in list results and counted, never
// rendered as if they were valid.
//
// ENCRYPTION (19 Nov 2026): paper content lives in one AES-GCM blob
// (`encryptedBlob`, see src/crypto.ts). Plaintext `createdAt`/`updatedAt`
// and photo metadata stay top-level so lists order without decrypting.
// Legacy plaintext documents (no `encryptedBlob`) still read, and are
// migrated to the encrypted shape lazily on first read with a key (the
// migration preserves the original timestamps so the order does not
// change). A document that cannot be decrypted is returned as a
// LockedPaper, never silently dropped.

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { CryptoError, decryptJson, encryptJson } from "../crypto";
import { AppError, toAppError } from "../errors";
import { logWarn } from "../platform/logging";
import type { LockedPaper, Mood, Paper, PaperInput, PhotoMeta, SensitivityInfo } from "../types";
import { MOODS } from "../types";
import { validatePaperInput } from "./validation";

export const SEARCH_FETCH_CAP = 200;

/** The fields that live inside the encrypted blob. */
interface EncryptedFields {
  title: string;
  body: string;
  tags: string[];
  mood: Mood;
  summary: string | null;
  sensitivity: SensitivityInfo | null;
}

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

function readMood(value: unknown): Mood {
  return typeof value === "string" && (MOODS as readonly string[]).includes(value)
    ? (value as Mood)
    : "unknown";
}

/** Validate the decrypted blob content; null when it is not a paper. */
function readEncryptedFields(value: unknown): EncryptedFields | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = value["title"];
  const body = value["body"];
  const tags = value["tags"];
  const summary = value["summary"];
  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    !Array.isArray(tags) ||
    !tags.every((tag) => typeof tag === "string") ||
    (summary !== null && typeof summary !== "string")
  ) {
    return null;
  }
  return {
    title,
    body,
    tags: [...tags],
    mood: readMood(value["mood"]),
    summary: summary as string | null,
    sensitivity: readSensitivity(value["sensitivity"]),
  };
}

/** The pre-encryption document shape: plaintext title/body/tags. */
function readLegacyPaper(data: DocumentData, id: string): Paper | null {
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
  const summaryRaw = data["summary"];
  return {
    id,
    title,
    body,
    tags: [...tags],
    mood: readMood(data["mood"]),
    summary: typeof summaryRaw === "string" ? summaryRaw : null,
    sensitivity: readSensitivity(data["sensitivity"]),
    photo: readPhoto(data["photo"]),
    createdAt: timestampToMillis(data["createdAt"]),
    updatedAt: timestampToMillis(data["updatedAt"]),
  };
}

/** True when the document still carries legacy plaintext content fields
 * (whether or not it already has a blob — a mixed document is migrated
 * to the encrypted-only shape on read). */
export function isLegacyDoc(data: DocumentData): boolean {
  return typeof data["title"] === "string" || typeof data["body"] === "string" || Array.isArray(data["tags"]);
}

function fieldsToBlobFields(paper: Paper): EncryptedFields {
  return {
    title: paper.title,
    body: paper.body,
    tags: [...paper.tags],
    mood: paper.mood,
    summary: paper.summary,
    sensitivity: paper.sensitivity,
  };
}

/**
 * Build the migrated (encrypted) document for a legacy paper, preserving
 * its original timestamps and photo metadata so the list order does not
 * change. Returns null when the legacy document is malformed. Pure:
 * the caller performs the write.
 */
export async function buildMigratedDoc(
  data: DocumentData,
  key: CryptoKey,
): Promise<Record<string, unknown> | null> {
  const legacy = readLegacyPaper(data, "migrated");
  if (legacy === null) {
    return null;
  }
  const blob = await encryptJson(fieldsToBlobFields(legacy), key);
  return {
    encryptedBlob: blob,
    photo: data["photo"] ?? null,
    createdAt: data["createdAt"],
    updatedAt: data["updatedAt"],
  };
}

/**
 * Strict reader: returns null for documents that fail required-field checks.
 * Encrypted documents need the key: without it they come back as a
 * LockedPaper ("locked"), and with a wrong/tampered blob as LockedPaper
 * ("corrupt"). A legacy plaintext document reads as before.
 */
export async function paperFromDoc(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
  key: CryptoKey | null,
): Promise<Paper | LockedPaper | null> {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  const createdAt = timestampToMillis(data["createdAt"]);
  const updatedAt = timestampToMillis(data["updatedAt"]);
  const photo = readPhoto(data["photo"]);
  const blob = data["encryptedBlob"];
  if (typeof blob === "string") {
    if (key === null) {
      return { id: snapshot.id, createdAt, updatedAt, reason: "locked" };
    }
    let decrypted: unknown;
    try {
      decrypted = await decryptJson(blob, key);
    } catch (error) {
      if (error instanceof CryptoError) {
        return { id: snapshot.id, createdAt, updatedAt, reason: "corrupt" };
      }
      throw error;
    }
    const fields = readEncryptedFields(decrypted);
    if (fields === null) {
      return null;
    }
    return { id: snapshot.id, ...fields, photo, createdAt, updatedAt };
  }
  return readLegacyPaper(data, snapshot.id);
}

/**
 * Decide how a legacy document is sealed. Two cases:
 * - Pure legacy (no blob): encrypt the legacy fields into a fresh document.
 * - Mixed (blob + leftover plaintext fields): the blob is authoritative —
 *   re-encrypting the stale legacy fields over it would LOSE the blob's
 *   content, so only the plaintext fields are deleted and the blob is
 *   left untouched.
 * Returns null for a malformed legacy document (nothing to seal).
 */
export async function buildLegacyMigration(
  data: DocumentData,
  key: CryptoKey,
): Promise<
  | { kind: "migrate"; doc: Record<string, unknown> }
  | { kind: "cleanup"; update: Record<string, unknown> }
  | null
> {
  if (typeof data["encryptedBlob"] === "string") {
    return {
      kind: "cleanup",
      update: {
        title: deleteField(),
        body: deleteField(),
        tags: deleteField(),
        summary: deleteField(),
        sensitivity: deleteField(),
        mood: deleteField(),
      },
    };
  }
  const doc = await buildMigratedDoc(data, key);
  return doc === null ? null : { kind: "migrate", doc };
}

/**
 * Migrate one legacy document to the encrypted shape. A failed migration
 * never fails the read that triggered it; it is logged and retried on the
 * next read.
 */
async function migrateLegacyDoc(
  db: Firestore,
  uid: string,
  paperId: string,
  data: DocumentData,
  key: CryptoKey,
): Promise<void> {
  try {
    const plan = await buildLegacyMigration(data, key);
    if (plan === null) {
      // Malformed legacy document: there are no valid fields to seal, so
      // it stays as it is (the list already skips and counts it). Never
      // deleted silently.
      logWarn("paper_migration_skipped_malformed", { paperId });
      return;
    }
    const ref = doc(db, "users", uid, "papers", paperId);
    if (plan.kind === "migrate") {
      await setDoc(ref, plan.doc);
    } else {
      await updateDoc(ref, plan.update);
    }
  } catch (error) {
    logWarn("paper_migration_failed", { paperId, message: error instanceof Error ? error.message : "unknown" });
  }
}

export interface PaperPage {
  papers: Paper[];
  locked: LockedPaper[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  skippedMalformed: number;
}

export async function listPapersPage(
  db: Firestore,
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  key: CryptoKey | null,
): Promise<PaperPage> {
  try {
    const base = query(papersCollection(db, uid), orderBy("updatedAt", "desc"), limit(pageSize + 1));
    const paged = cursor !== null ? query(base, startAfter(cursor)) : base;
    const snapshot = await getDocs(paged);
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const papers: Paper[] = [];
    const locked: LockedPaper[] = [];
    let skippedMalformed = 0;
    for (const docSnap of pageDocs) {
      const paper = await paperFromDoc(docSnap, key);
      if (paper === null) {
        skippedMalformed += 1;
      } else if ("reason" in paper) {
        locked.push(paper);
      } else {
        papers.push(paper);
        // Lazy migration: first read with a key seals a legacy paper.
        if (key !== null && isLegacyDoc(docSnap.data())) {
          await migrateLegacyDoc(db, uid, docSnap.id, docSnap.data(), key);
        }
      }
    }
    if (skippedMalformed > 0) {
      logWarn("papers_malformed_skipped", { count: skippedMalformed });
    }
    const lastDoc = pageDocs[pageDocs.length - 1] ?? null;
    return { papers, locked, nextCursor: hasMore ? lastDoc : null, hasMore, skippedMalformed };
  } catch (error) {
    throw toAppError(error, "Loading papers failed");
  }
}

export async function getPaper(
  db: Firestore,
  uid: string,
  paperId: string,
  key: CryptoKey | null,
): Promise<Paper | LockedPaper | null> {
  try {
    const snapshot = await getDoc(doc(db, "users", uid, "papers", paperId));
    const paper = await paperFromDoc(snapshot, key);
    if (paper !== null && !("reason" in paper) && key !== null && snapshot.exists() && isLegacyDoc(snapshot.data())) {
      await migrateLegacyDoc(db, uid, paperId, snapshot.data(), key);
    }
    return paper;
  } catch (error) {
    throw toAppError(error, "Loading this paper failed");
  }
}

export async function createPaper(
  db: Firestore,
  uid: string,
  input: PaperInput,
  maxPaperChars: number,
  key: CryptoKey | null,
): Promise<string> {
  const validated = validatePaperInput(input, maxPaperChars);
  if (!validated.ok) {
    throw new AppError("validation", validated.issues.join(" "), "Fix the highlighted fields and try again.");
  }
  if (key === null) {
    throw new AppError(
      "locked",
      "Saving the paper failed: encryption is locked.",
      "Enter your encryption passphrase to unlock the archive, then try again.",
    );
  }
  try {
    const blob = await encryptJson(
      {
        title: validated.value.title,
        body: validated.value.body,
        tags: validated.value.tags,
        mood: "unknown",
        summary: null,
        sensitivity: null,
      } satisfies EncryptedFields,
      key,
    );
    const ref = await addDoc(papersCollection(db, uid), {
      encryptedBlob: blob,
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
  key: CryptoKey | null,
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
  if (key === null) {
    throw new AppError(
      "locked",
      "Updating the paper failed: encryption is locked.",
      "Enter your encryption passphrase to unlock the archive, then try again.",
    );
  }
  try {
    // The blob holds the whole content set, so an update must read the
    // current decrypted paper, apply the patch, and re-encrypt everything:
    // encrypting only the patch would silently drop the other fields.
    const current = await getPaper(db, uid, paperId, key);
    if (current === null) {
      throw new AppError("unknown", "Updating the paper failed: the paper no longer exists.", "Reload the papers list and try again.");
    }
    if ("reason" in current) {
      throw new AppError(
        "locked",
        current.reason === "locked"
          ? "Updating the paper failed: the paper is locked."
          : "Updating the paper failed: the paper cannot be decrypted.",
        "Enter your encryption passphrase to unlock the archive, then try again.",
      );
    }
    const merged: Paper = { ...current };
    if (patch.title !== undefined) merged.title = patch.title;
    if (patch.body !== undefined) merged.body = patch.body;
    if (patch.tags !== undefined) merged.tags = patch.tags;
    if (patch.mood !== undefined) merged.mood = patch.mood;
    if (patch.summary !== undefined) merged.summary = patch.summary;
    if (patch.sensitivity !== undefined) merged.sensitivity = patch.sensitivity;
    if (patch.photo !== undefined) merged.photo = patch.photo;
    const blob = await encryptJson(fieldsToBlobFields(merged), key);
    const update: Record<string, unknown> = {
      encryptedBlob: blob,
      updatedAt: serverTimestamp(),
      // A legacy paper updated this way must lose its plaintext fields,
      // or the plaintext would linger beside the blob. Deleting a field
      // that is already absent is a no-op.
      title: deleteField(),
      body: deleteField(),
      tags: deleteField(),
      mood: deleteField(),
      summary: deleteField(),
      sensitivity: deleteField(),
    };
    if (patch.photo !== undefined) {
      update["photo"] = patch.photo;
    }
    await updateDoc(doc(db, "users", uid, "papers", paperId), update);
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
  lockedCount: number;
  truncated: boolean;
  skippedMalformed: number;
}

/** Fetch papers for client-side search, up to a documented cap. */
export async function fetchPapersForSearch(
  db: Firestore,
  uid: string,
  cap: number = SEARCH_FETCH_CAP,
  key: CryptoKey | null = null,
): Promise<SearchFetchResult> {
  const papers: Paper[] = [];
  let lockedCount = 0;
  let skippedMalformed = 0;
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let truncated = false;
  while (papers.length < cap) {
    const page = await listPapersPage(db, uid, Math.min(50, cap - papers.length), cursor, key);
    papers.push(...page.papers);
    lockedCount += page.locked.length;
    skippedMalformed += page.skippedMalformed;
    if (!page.hasMore || page.nextCursor === null) {
      break;
    }
    cursor = page.nextCursor;
    if (papers.length >= cap) {
      truncated = true;
    }
  }
  return { papers, lockedCount, truncated, skippedMalformed };
}
