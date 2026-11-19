import { describe, expect, it } from "vitest";
import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { deriveKey, encryptJson } from "../src/crypto";
import { buildLegacyMigration, buildMigratedDoc, isLegacyDoc, paperFromDoc } from "../src/data/papers";

function fakeSnapshot(
  id: string,
  data: Record<string, unknown> | null,
): QueryDocumentSnapshot<DocumentData> {
  return {
    id,
    exists: () => data !== null,
    data: () => data ?? {},
  } as unknown as QueryDocumentSnapshot<DocumentData>;
}

function fakeTimestamp(millis: number) {
  return { toMillis: () => millis };
}

const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

async function testKey(): Promise<CryptoKey> {
  return deriveKey("test passphrase for papers", SALT);
}

async function encryptedSnapshot(id: string, key: CryptoKey) {
  const blob = await encryptJson(
    {
      title: "T",
      body: "B",
      tags: ["a"],
      mood: "calm",
      summary: "S",
      sensitivity: null,
    },
    key,
  );
  return fakeSnapshot(id, {
    encryptedBlob: blob,
    photo: null,
    createdAt: fakeTimestamp(1000),
    updatedAt: fakeTimestamp(2000),
  });
}

const LEGACY_DATA = {
  title: "T",
  body: "B",
  tags: ["a"],
  mood: "calm",
  summary: "S",
  sensitivity: {
    level: "low",
    categories: ["names"],
    notes: "N",
    redactedPreview: "R",
    scannedAt: fakeTimestamp(5000),
    scannedOnDevice: true,
  },
  photo: { name: "img.png", mimeType: "image/png", width: 100, height: 200, readAt: fakeTimestamp(6000) },
  createdAt: fakeTimestamp(1000),
  updatedAt: fakeTimestamp(2000),
};

describe("paperFromDoc (legacy plaintext documents)", () => {
  it("reads a complete document", async () => {
    const paper = await paperFromDoc(fakeSnapshot("p1", { ...LEGACY_DATA }), null);
    expect(paper).toEqual({
      id: "p1",
      title: "T",
      body: "B",
      tags: ["a"],
      mood: "calm",
      summary: "S",
      sensitivity: {
        level: "low",
        categories: ["names"],
        notes: "N",
        redactedPreview: "R",
        scannedAt: 5000,
        scannedOnDevice: true,
      },
      photo: { name: "img.png", mimeType: "image/png", width: 100, height: 200, readAt: 6000 },
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it("returns null for a missing document", async () => {
    expect(await paperFromDoc(fakeSnapshot("p1", null) as unknown as DocumentSnapshot<DocumentData>, null)).toBeNull();
  });

  it("returns null when required fields have wrong types", async () => {
    expect(await paperFromDoc(fakeSnapshot("p1", { title: 42, body: "B", tags: [] }), null)).toBeNull();
    expect(await paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: "not-an-array" }), null)).toBeNull();
    expect(await paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: ["a", 1] }), null)).toBeNull();
    expect(await paperFromDoc(fakeSnapshot("p1", { title: "T" }), null)).toBeNull();
  });

  it("falls back to unknown mood for an unrecognized mood value", async () => {
    const paper = await paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: [], mood: "ecstatic" }), null);
    expect(paper !== null && !("reason" in paper) ? paper.mood : undefined).toBe("unknown");
  });

  it("drops malformed sensitivity and photo blocks instead of failing the paper", async () => {
    const paper = await paperFromDoc(
      fakeSnapshot("p1", {
        title: "T",
        body: "B",
        tags: [],
        sensitivity: { level: "critical" },
        photo: { name: "x", mimeType: "image/gif", width: 1, height: 1 },
      }),
      null,
    );
    expect(paper !== null && !("reason" in paper) ? paper.sensitivity : "not-a-paper").toBeNull();
    expect(paper !== null && !("reason" in paper) ? paper.photo : "not-a-paper").toBeNull();
  });

  it("reads numeric timestamps and defaults missing ones to 0", async () => {
    const paper = await paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: [], createdAt: 1234 }), null);
    expect(paper !== null && !("reason" in paper) ? paper.createdAt : undefined).toBe(1234);
    expect(paper !== null && !("reason" in paper) ? paper.updatedAt : undefined).toBe(0);
  });

  it("reads real Firestore Timestamps (toMillis needs its receiver)", async () => {
    const paper = await paperFromDoc(
      fakeSnapshot("p1", {
        title: "T",
        body: "B",
        tags: [],
        createdAt: Timestamp.fromMillis(1000),
        updatedAt: Timestamp.fromMillis(2000),
      }),
      null,
    );
    expect(paper !== null && !("reason" in paper) ? paper.createdAt : undefined).toBe(1000);
    expect(paper !== null && !("reason" in paper) ? paper.updatedAt : undefined).toBe(2000);
  });

  it("reads prototype-method timestamps that read `this`", async () => {
    class ThisTimestamp {
      constructor(
        private readonly seconds: number,
        private readonly nanoseconds: number,
      ) {}
      toMillis(): number {
        return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
      }
    }
    const paper = await paperFromDoc(
      fakeSnapshot("p1", {
        title: "T",
        body: "B",
        tags: [],
        createdAt: new ThisTimestamp(1, 500_000),
        updatedAt: new ThisTimestamp(2, 0),
      }),
      null,
    );
    expect(paper !== null && !("reason" in paper) ? paper.createdAt : undefined).toBe(1000);
    expect(paper !== null && !("reason" in paper) ? paper.updatedAt : undefined).toBe(2000);
  });
});

describe("paperFromDoc (encrypted documents)", () => {
  it("decrypts with the right key", async () => {
    const key = await testKey();
    const paper = await paperFromDoc(await encryptedSnapshot("p1", key), key);
    expect(paper).toEqual({
      id: "p1",
      title: "T",
      body: "B",
      tags: ["a"],
      mood: "calm",
      summary: "S",
      sensitivity: null,
      photo: null,
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it("returns a locked placeholder without a key, never the content", async () => {
    const key = await testKey();
    const paper = await paperFromDoc(await encryptedSnapshot("p1", key), null);
    expect(paper).toEqual({ id: "p1", createdAt: 1000, updatedAt: 2000, reason: "locked" });
  });

  it("returns a corrupt placeholder for the wrong key", async () => {
    const key = await testKey();
    const wrong = await deriveKey("a different passphrase", SALT);
    const paper = await paperFromDoc(await encryptedSnapshot("p1", key), wrong);
    expect(paper).toEqual({ id: "p1", createdAt: 1000, updatedAt: 2000, reason: "corrupt" });
  });

  it("returns a corrupt placeholder for a tampered blob", async () => {
    const key = await testKey();
    const blob = await encryptJson({ title: "T", body: "B", tags: [], mood: "unknown", summary: null, sensitivity: null }, key);
    const parts = blob.split(".");
    const tampered = `${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const paper = await paperFromDoc(
      fakeSnapshot("p1", { encryptedBlob: tampered, createdAt: fakeTimestamp(1000), updatedAt: fakeTimestamp(2000) }),
      key,
    );
    expect(paper).toEqual({ id: "p1", createdAt: 1000, updatedAt: 2000, reason: "corrupt" });
  });

  it("returns null when the decrypted content is not a paper", async () => {
    const key = await testKey();
    const blob = await encryptJson({ title: 42, body: "B" }, key);
    const paper = await paperFromDoc(
      fakeSnapshot("p1", { encryptedBlob: blob, createdAt: fakeTimestamp(1000), updatedAt: fakeTimestamp(2000) }),
      key,
    );
    expect(paper).toBeNull();
  });
});

describe("isLegacyDoc / buildMigratedDoc", () => {
  it("detects legacy documents by leftover plaintext fields, even beside a blob", () => {
    expect(isLegacyDoc({ title: "T", body: "B", tags: [] })).toBe(true);
    expect(isLegacyDoc({ encryptedBlob: "v1.x.y" })).toBe(false);
    expect(isLegacyDoc({ encryptedBlob: "v1.x.y", title: "T", body: "B", tags: [] })).toBe(true);
    expect(isLegacyDoc({})).toBe(false);
  });

  it("builds an encrypted document that decrypts back to the original fields", async () => {
    const key = await testKey();
    const migrated = await buildMigratedDoc({ ...LEGACY_DATA }, key);
    expect(migrated).not.toBeNull();
    expect(typeof migrated?.["encryptedBlob"]).toBe("string");
    // No plaintext content survives in the migrated document.
    expect(migrated?.["title"]).toBeUndefined();
    expect(migrated?.["body"]).toBeUndefined();
    expect(migrated?.["tags"]).toBeUndefined();
    expect(migrated?.["summary"]).toBeUndefined();
    // Timestamps and photo metadata are preserved verbatim (no reorder).
    expect(migrated?.["createdAt"]).toBe(LEGACY_DATA.createdAt);
    expect(migrated?.["updatedAt"]).toBe(LEGACY_DATA.updatedAt);
    expect(migrated?.["photo"]).toBe(LEGACY_DATA.photo);
    const { decryptJson } = await import("../src/crypto");
    const fields = await decryptJson(migrated?.["encryptedBlob"] as string, key);
    expect(fields).toMatchObject({ title: "T", body: "B", tags: ["a"], mood: "calm", summary: "S" });
  });

  it("returns null for a malformed legacy document", async () => {
    const key = await testKey();
    expect(await buildMigratedDoc({ title: 42, body: "B", tags: [] }, key)).toBeNull();
  });

  it("buildLegacyMigration seals a pure legacy document", async () => {
    const key = await testKey();
    const plan = await buildLegacyMigration({ ...LEGACY_DATA }, key);
    expect(plan?.kind).toBe("migrate");
    if (plan?.kind === "migrate") {
      expect(typeof plan.doc["encryptedBlob"]).toBe("string");
    }
  });

  it("buildLegacyMigration only deletes leftover fields on a mixed document, never re-encrypts over the blob", async () => {
    const key = await testKey();
    const plan = await buildLegacyMigration({ encryptedBlob: "v1.abc.def", title: "STALE", body: "STALE", tags: ["stale"] }, key);
    expect(plan?.kind).toBe("cleanup");
    if (plan?.kind === "cleanup") {
      expect(Object.keys(plan.update).sort()).toEqual(["body", "mood", "sensitivity", "summary", "tags", "title"]);
      expect(plan.update["encryptedBlob"]).toBeUndefined();
    }
  });

  it("buildLegacyMigration returns null for a malformed legacy document", async () => {
    const key = await testKey();
    expect(await buildLegacyMigration({ title: 42, body: "B", tags: [] }, key)).toBeNull();
  });
});
