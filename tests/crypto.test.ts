import { describe, expect, it } from "vitest";
import {
  CryptoError,
  clearCurrentKey,
  decodeBase64Url,
  decryptJson,
  deriveKey,
  encodeBase64Url,
  encryptJson,
  generateSalt,
  getCurrentKey,
  getVersion,
  setCurrentKey,
  validatePassphrase,
} from "../src/crypto";

const PASSPHRASE = "correct horse battery staple";
const OTHER_PASSPHRASE = "a completely different phrase";

async function keyFor(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKey(passphrase, salt);
}

describe("base64url helpers", () => {
  it("round-trips binary data, including padding edge cases", () => {
    for (const bytes of [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255, 254]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([0, 127, 255, 64, 32]),
    ]) {
      expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
    }
    // No padding characters and no URL-unsafe characters in the output.
    expect(encodeBase64Url(new Uint8Array([251, 255, 254]))).not.toMatch(/[+/=]/);
  });

  it("rejects non-base64url input", () => {
    expect(() => decodeBase64Url("not base64!")).toThrow(CryptoError);
  });
});

describe("validatePassphrase", () => {
  it("requires at least 8 characters", () => {
    expect(validatePassphrase("short")).toHaveLength(1);
    expect(validatePassphrase("12345678")).toHaveLength(0);
    expect(validatePassphrase("")).toHaveLength(1);
  });
});

describe("deriveKey", () => {
  it("derives the same key from the same passphrase and salt", async () => {
    const salt = generateSalt();
    const a = await keyFor(PASSPHRASE, salt);
    const b = await keyFor(PASSPHRASE, salt);
    const blob = await encryptJson({ x: 1 }, a);
    await expect(decryptJson(blob, b)).resolves.toEqual({ x: 1 });
  });

  it("derives a different key for a different passphrase or salt", async () => {
    const salt = generateSalt();
    const key = await keyFor(PASSPHRASE, salt);
    const wrongPass = await keyFor(OTHER_PASSPHRASE, salt);
    const wrongSalt = await keyFor(PASSPHRASE, generateSalt());
    const blob = await encryptJson({ x: 1 }, key);
    await expect(decryptJson(blob, wrongPass)).rejects.toThrow(CryptoError);
    await expect(decryptJson(blob, wrongSalt)).rejects.toThrow(CryptoError);
  });

  it("is non-extractable: the raw key can never be exported from memory", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });
});

describe("encryptJson / decryptJson", () => {
  it("round-trips objects, strings, arrays and unicode", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    const value = {
      title: "Bali trip - Ünïcödé ✓",
      body: "Line one.\nLine two with emoji 🗝️.",
      tags: ["bali", "2026"],
      nested: { n: 42, list: [1, "two", null, true] },
    };
    const blob = await encryptJson(value, key);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain(PASSPHRASE);
    expect(blob).not.toContain("Bali trip");
    await expect(decryptJson(blob, key)).resolves.toEqual(value);
  });

  it("uses a fresh IV every time, so identical plaintext encrypts differently", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    const a = await encryptJson({ x: "same" }, key);
    const b = await encryptJson({ x: "same" }, key);
    expect(a).not.toBe(b);
    await expect(decryptJson(a, key)).resolves.toEqual({ x: "same" });
    await expect(decryptJson(b, key)).resolves.toEqual({ x: "same" });
  });

  it("rejects decryption with the wrong passphrase", async () => {
    const salt = generateSalt();
    const key = await keyFor(PASSPHRASE, salt);
    const wrong = await keyFor(OTHER_PASSPHRASE, salt);
    const blob = await encryptJson({ secret: "do not read" }, key);
    await expect(decryptJson(blob, wrong)).rejects.toThrow(CryptoError);
  });

  it("detects tampered ciphertext via GCM authentication failure", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    const blob = await encryptJson({ secret: "do not read" }, key);
    const parts = blob.split(".");
    const cipherBytes = decodeBase64Url(parts[2]!);
    cipherBytes[0] = cipherBytes[0]! ^ 0xff; // flip one byte in the ciphertext
    const tampered = `${parts[0]}.${parts[1]}.${encodeBase64Url(cipherBytes)}`;
    await expect(decryptJson(tampered, key)).rejects.toThrow(CryptoError);
  });

  it("detects a tampered IV", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    const blob = await encryptJson({ secret: "do not read" }, key);
    const parts = blob.split(".");
    const ivBytes = decodeBase64Url(parts[1]!);
    ivBytes[0] = ivBytes[0]! ^ 0x01;
    const tampered = `${parts[0]}.${encodeBase64Url(ivBytes)}.${parts[2]}`;
    await expect(decryptJson(tampered, key)).rejects.toThrow(CryptoError);
  });

  it("rejects an unknown version and malformed blobs", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    await expect(decryptJson("v2.aaaa.bbbb", key)).rejects.toThrow(CryptoError);
    await expect(decryptJson("not-a-blob", key)).rejects.toThrow(CryptoError);
    await expect(decryptJson("v1..", key)).rejects.toThrow(CryptoError);
    await expect(decryptJson("", key)).rejects.toThrow(CryptoError);
  });

  it("never writes key material to web storage", async () => {
    const key = await keyFor(PASSPHRASE, generateSalt());
    await encryptJson({ x: 1 }, key);
    // The module has no storage access at all; assert the stores (when
    // present in the test environment) hold nothing key-like.
    for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
      if (store === undefined) continue;
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i) ?? "";
        expect(store.getItem(k)).not.toContain(PASSPHRASE);
      }
    }
    expect(getCurrentKey("nobody")).toBeNull();
  });
});

describe("getVersion", () => {
  it("returns the version prefix", () => {
    expect(getVersion("v1.abc.def")).toBe("v1");
    expect(getVersion("")).toBeNull();
  });
});

describe("in-memory key holder", () => {
  it("holds the key only for its uid and clears on demand", async () => {
    clearCurrentKey();
    const key = await keyFor(PASSPHRASE, generateSalt());
    expect(getCurrentKey("u1")).toBeNull();
    setCurrentKey("u1", key);
    expect(getCurrentKey("u1")).toBe(key);
    expect(getCurrentKey("u2")).toBeNull();
    clearCurrentKey();
    expect(getCurrentKey("u1")).toBeNull();
  });
});
