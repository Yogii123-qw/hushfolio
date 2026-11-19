import { describe, expect, it } from "vitest";
import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { paperFromDoc } from "../src/data/papers";

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

describe("paperFromDoc", () => {
  it("reads a complete document", () => {
    const paper = paperFromDoc(
      fakeSnapshot("p1", {
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
      }),
    );
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

  it("returns null for a missing document", () => {
    expect(paperFromDoc(fakeSnapshot("p1", null) as unknown as DocumentSnapshot<DocumentData>)).toBeNull();
  });

  it("returns null when required fields have wrong types", () => {
    expect(paperFromDoc(fakeSnapshot("p1", { title: 42, body: "B", tags: [] }))).toBeNull();
    expect(paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: "not-an-array" }))).toBeNull();
    expect(paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: ["a", 1] }))).toBeNull();
    expect(paperFromDoc(fakeSnapshot("p1", { title: "T" }))).toBeNull();
  });

  it("falls back to unknown mood for an unrecognized mood value", () => {
    const paper = paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: [], mood: "ecstatic" }));
    expect(paper?.mood).toBe("unknown");
  });

  it("drops malformed sensitivity and photo blocks instead of failing the paper", () => {
    const paper = paperFromDoc(
      fakeSnapshot("p1", {
        title: "T",
        body: "B",
        tags: [],
        sensitivity: { level: "critical" },
        photo: { name: "x", mimeType: "image/gif", width: 1, height: 1 },
      }),
    );
    expect(paper?.sensitivity).toBeNull();
    expect(paper?.photo).toBeNull();
  });

  it("reads numeric timestamps and defaults missing ones to 0", () => {
    const paper = paperFromDoc(fakeSnapshot("p1", { title: "T", body: "B", tags: [], createdAt: 1234 }));
    expect(paper?.createdAt).toBe(1234);
    expect(paper?.updatedAt).toBe(0);
  });

  it("reads real Firestore Timestamps (toMillis needs its receiver)", () => {
    const paper = paperFromDoc(
      fakeSnapshot("p1", {
        title: "T",
        body: "B",
        tags: [],
        createdAt: Timestamp.fromMillis(1000),
        updatedAt: Timestamp.fromMillis(2000),
      }),
    );
    expect(paper?.createdAt).toBe(1000);
    expect(paper?.updatedAt).toBe(2000);
  });

  it("reads prototype-method timestamps that read `this`", () => {
    class ThisTimestamp {
      constructor(
        private readonly seconds: number,
        private readonly nanoseconds: number,
      ) {}
      toMillis(): number {
        return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
      }
    }
    const paper = paperFromDoc(
      fakeSnapshot("p1", {
        title: "T",
        body: "B",
        tags: [],
        createdAt: new ThisTimestamp(1, 500_000),
        updatedAt: new ThisTimestamp(2, 0),
      }),
    );
    expect(paper?.createdAt).toBe(1000);
    expect(paper?.updatedAt).toBe(2000);
  });
});
