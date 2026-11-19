// Passphrase setup / unlock against Firestore.
//
// One per-user salt + one check value live in the user's own document
// (`users/{uid}`): `encryptionSalt` (Base64URL, not secret) and
// `encryptionCheck` (an encrypted constant). Unlock derives the key from
// the passphrase + salt and decrypts the check: failure means the
// passphrase is wrong, without needing any paper to exist. The derived
// key lives only in module memory (src/crypto.ts holder) and is cleared
// on sign-out / Lock.

import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import {
  clearCurrentKey,
  decodeBase64Url,
  decryptJson,
  deriveKey,
  encodeBase64Url,
  encryptJson,
  generateSalt,
  setCurrentKey,
  validatePassphrase,
} from "../crypto";
import { AppError, toAppError } from "../errors";

export const CHECK_VALUE = "hushfolio-v1";

export interface EncryptionState {
  salt: Uint8Array | null;
  check: string | null;
}

function userDoc(db: Firestore, uid: string) {
  return doc(db, "users", uid);
}

export async function loadEncryptionState(db: Firestore, uid: string): Promise<EncryptionState> {
  try {
    const snapshot = await getDoc(userDoc(db, uid));
    if (!snapshot.exists()) {
      return { salt: null, check: null };
    }
    const data = snapshot.data();
    const saltRaw = data["encryptionSalt"];
    const checkRaw = data["encryptionCheck"];
    if (typeof saltRaw !== "string" || typeof checkRaw !== "string") {
      return { salt: null, check: null };
    }
    try {
      return { salt: decodeBase64Url(saltRaw), check: checkRaw };
    } catch {
      return { salt: null, check: null };
    }
  } catch (error) {
    throw toAppError(error, "Checking encryption setup failed");
  }
}

/**
 * First-time setup: create the salt + check value from a new passphrase.
 * Throws AppError("validation") for a weak passphrase.
 */
export async function setupEncryption(
  db: Firestore,
  uid: string,
  passphrase: string,
): Promise<CryptoKey> {
  const issues = validatePassphrase(passphrase);
  if (issues.length > 0) {
    throw new AppError("validation", issues.join(" "), "Choose a passphrase of at least 8 characters.");
  }
  const salt = generateSalt();
  const key = await deriveKey(passphrase, salt);
  const check = await encryptJson({ check: CHECK_VALUE }, key);
  try {
    await setDoc(
      userDoc(db, uid),
      { encryptionSalt: encodeBase64Url(salt), encryptionCheck: check },
      { merge: true },
    );
  } catch (error) {
    throw toAppError(error, "Saving the encryption setup failed");
  }
  setCurrentKey(uid, key);
  return key;
}

/**
 * Unlock with an existing passphrase. Throws AppError("locked") when the
 * passphrase is wrong; the archive stays locked and nothing is deleted.
 */
export async function unlockEncryption(
  db: Firestore,
  uid: string,
  passphrase: string,
): Promise<CryptoKey> {
  const state = await loadEncryptionState(db, uid);
  if (state.salt === null || state.check === null) {
    throw new AppError(
      "locked",
      "Encryption is not set up for this account yet.",
      "Set an encryption passphrase first, then unlock the archive.",
    );
  }
  const key = await deriveKey(passphrase, state.salt);
  const wrongPassphrase = (): AppError =>
    new AppError(
      "locked",
      "The passphrase you entered didn't unlock the archive. Please try again.",
      "Nothing was deleted. If you cannot remember the passphrase, the papers sealed with it cannot be recovered.",
    );
  let opened: unknown;
  try {
    opened = await decryptJson(state.check, key);
  } catch {
    throw wrongPassphrase();
  }
  const record = opened as Record<string, unknown> | null;
  if (record === null || typeof record !== "object" || record["check"] !== CHECK_VALUE) {
    throw wrongPassphrase();
  }
  setCurrentKey(uid, key);
  return key;
}

/** Lock the archive: forget the key in memory. The papers stay sealed. */
export function lockEncryption(): void {
  clearCurrentKey();
}
