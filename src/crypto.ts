// Real client-side encryption for Hushfolio papers.
//
// Design (blueprint: audit-buildhybridai/ENCRYPTION-BLUEPRINT.md, Groq
// advisor 19 Nov 2026): WebCrypto AES-GCM, key from a user passphrase via
// PBKDF2-SHA-256 (200,000 iterations, 256-bit, non-extractable). One
// per-user salt lives in Firestore (users/{uid}.encryptionSalt, not
// secret); the derived key lives ONLY in module memory and is cleared on
// sign-out / Lock. Ciphertext format: `v1.<iv-b64url>.<cipher-b64url>`
// (fresh random 12-byte IV per encryption; GCM tag is part of the
// ciphertext). Nothing here ever touches localStorage, sessionStorage,
// or Firestore with key material.

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export const ENCRYPTION_VERSION = "v1";
export const PBKDF2_ITERATIONS = 200_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const MIN_PASSPHRASE_LENGTH = 8;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Base64URL (no padding) for binary data; safe in Firestore strings. */
export function encodeBase64Url(bytes: Uint8Array): string {
  const chars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    chars[i] = String.fromCharCode(bytes[i]!);
  }
  return btoa(chars.join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new CryptoError("Invalid base64url data.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = padded.length % 4;
  const withPadding = remainder === 0 ? padded : padded + "=".repeat(4 - remainder);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Passphrase rules for setup/change. Returns human-readable issues. */
export function validatePassphrase(passphrase: string): string[] {
  const issues: string[] = [];
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    issues.push(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  return issues;
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: the key can never be exported from memory
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a JSON-serializable value. Returns the `v1.<iv>.<cipher>` blob. */
export async function encryptJson(value: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = textEncoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext);
  return `${ENCRYPTION_VERSION}.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

/** Decrypt a blob produced by encryptJson. Throws CryptoError on any failure. */
export async function decryptJson(blob: string, key: CryptoKey): Promise<unknown> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== ENCRYPTION_VERSION) {
    throw new CryptoError("This paper uses an unknown encryption format.");
  }
  const ivPart = parts[1]!;
  const cipherPart = parts[2]!;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = decodeBase64Url(ivPart);
    ciphertext = decodeBase64Url(cipherPart);
  } catch {
    throw new CryptoError("This paper's encrypted data is damaged.");
  }
  if (iv.length !== IV_BYTES || ciphertext.length === 0) {
    throw new CryptoError("This paper's encrypted data is damaged.");
  }
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    // Wrong key and tampered ciphertext both land here (GCM auth failure).
    throw new CryptoError("This paper could not be decrypted with this passphrase.");
  }
  try {
    return JSON.parse(textDecoder.decode(plaintext));
  } catch {
    throw new CryptoError("This paper's decrypted data is damaged.");
  }
}

export function getVersion(blob: string): string | null {
  const version = blob.split(".", 1)[0];
  return version === undefined || version === "" ? null : version;
}

// ---------------------------------------------------------------------------
// In-memory key holder: one signed-in user at a time. Cleared on sign-out
// and on Lock; never persisted anywhere.
// ---------------------------------------------------------------------------

let current: { uid: string; key: CryptoKey } | null = null;

export function setCurrentKey(uid: string, key: CryptoKey): void {
  current = { uid, key };
}

export function getCurrentKey(uid: string): CryptoKey | null {
  return current !== null && current.uid === uid ? current.key : null;
}

export function clearCurrentKey(): void {
  current = null;
}
