// Authentication flows: anonymous by default (one tap, no email), with an
// optional upgrade to Google sign-in. A Google sign-in creates a SEPARATE
// account with its own empty archive - the UI says this before the user
// upgrades, because account linking is deliberately not implemented.

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { toAppError } from "../errors";
import { logInfo } from "./logging";

export function watchAuth(auth: Auth, onUser: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onUser);
}

export async function signInAnonymouslyFlow(auth: Auth): Promise<User> {
  try {
    const credential = await signInAnonymously(auth);
    logInfo("auth_signed_in", { method: "anonymous" });
    return credential.user;
  } catch (error) {
    throw toAppError(error, "Anonymous sign-in failed");
  }
}

export async function signInWithGoogleFlow(auth: Auth): Promise<User> {
  try {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    logInfo("auth_signed_in", { method: "google" });
    return credential.user;
  } catch (error) {
    throw toAppError(error, "Google sign-in failed");
  }
}

export async function signOutFlow(auth: Auth): Promise<void> {
  try {
    await signOut(auth);
    logInfo("auth_signed_out", {});
  } catch (error) {
    throw toAppError(error, "Sign-out failed");
  }
}
