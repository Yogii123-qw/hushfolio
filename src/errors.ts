// Error taxonomy: every failure the user can see carries a kind, the
// original error code (when one exists), a plain-language message, and a
// concrete next step. Nothing is ever swallowed into "something went wrong".

import { CryptoError } from "./crypto";

export type ErrorKind =
  | "config"
  | "auth"
  | "network"
  | "device_model"
  | "quota"
  | "permission"
  | "validation"
  | "model_output"
  | "locked"
  | "unknown";

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: string | null;
  readonly nextStep: string;

  constructor(kind: ErrorKind, message: string, nextStep: string, code: string | null = null) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
    this.nextStep = nextStep;
  }
}

function readCodeAndMessage(error: unknown): { code: string | null; message: string } {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const code = typeof record["code"] === "string" ? record["code"] : null;
    const message = typeof record["message"] === "string" ? record["message"] : "";
    return { code, message };
  }
  if (error instanceof Error) {
    return { code: null, message: error.message };
  }
  return { code: null, message: String(error) };
}

/**
 * Map any thrown value to an AppError. Mapping is conservative: only
 * well-known code/message patterns are classified; anything else keeps its
 * original code in the message so the user (and the developer) can see
 * exactly what the SDK reported. No error code is ever invented.
 */
export function toAppError(error: unknown, context: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  // A decryption failure is an encryption-lock problem, never a network
  // or unknown error: the paper is there, the key is wrong or missing.
  if (error instanceof CryptoError) {
    return new AppError(
      "locked",
      `${context}: ${error.message}`,
      "Enter your encryption passphrase to unlock the archive. If the passphrase is wrong, the paper stays locked; nothing is deleted.",
    );
  }
  const { code, message } = readCodeAndMessage(error);
  const haystack = `${code ?? ""} ${message}`.toLowerCase();
  const suffix = code ? ` (reported code: ${code})` : "";

  if (haystack.includes("permission-denied") || haystack.includes("permission denied")) {
    return new AppError(
      "permission",
      `${context}: the request was denied by Firestore security rules.${suffix}`,
      "Check that the Firestore rules from firestore.rules are published for this project, then try again.",
      code,
    );
  }
  if (haystack.includes("failed-precondition") || haystack.includes("app-check") || haystack.includes("appcheck")) {
    return new AppError(
      "permission",
      `${context}: the request was rejected, most likely by App Check enforcement.${suffix}`,
      "Open the Status view, confirm App Check is configured, and register a debug token for localhost development.",
      code,
    );
  }
  // Free-tier billing gate (must sit before the network branch below: the
  // Firebase AI SDK reports it as "Error fetching from ...", which the
  // network matcher would otherwise swallow as a connection failure).
  // Verified live 19 Nov 2026: HTTP 403 "The Gemini API free tier is not
  // available for this project. To use the Gemini API, please set up
  // billing to upgrade to the paid tier." This is a plan gate, not a bug
  // and not a transient quota, so the message says so plainly.
  if (
    haystack.includes("free tier is not available") ||
    haystack.includes("free tier not available") ||
    haystack.includes("set up billing") ||
    haystack.includes("upgrade to the paid tier")
  ) {
    return new AppError(
      "quota",
      `${context}: Cloud AI needs an active Firebase Blaze billing plan. The free tier is not available for this project, so cloud actions are off.${suffix}`,
      "Your papers stay private on this device. On-device actions keep working where the device model is available. To turn cloud AI on, upgrade the project to the Blaze plan in the Firebase console.",
      code,
    );
  }
  if (
    haystack.includes("resource-exhausted") ||
    haystack.includes("quota") ||
    haystack.includes("rate limit") ||
    haystack.includes("429")
  ) {
    return new AppError(
      "quota",
      `${context}: the cloud model quota or rate limit was reached.${suffix}`,
      "Wait a few minutes and try again, or switch on Strict mode to keep work on-device.",
      code,
    );
  }
  if (
    haystack.includes("unavailable") ||
    haystack.includes("network") ||
    haystack.includes("fetch") ||
    haystack.includes("failed to fetch") ||
    haystack.includes("offline")
  ) {
    return new AppError(
      "network",
      `${context}: the network request failed.${suffix}`,
      "Check your connection. On-device actions can still work offline once the model is downloaded.",
      code,
    );
  }
  if (haystack.includes("popup-blocked") || haystack.includes("popup-closed")) {
    return new AppError(
      "auth",
      `${context}: the sign-in popup was blocked or closed.${suffix}`,
      "Allow popups for this site and try again, or keep using anonymous sign-in.",
      code,
    );
  }
  if (code !== null && code.startsWith("auth/")) {
    return new AppError(
      "auth",
      `${context}: sign-in failed.${suffix}`,
      "Try again. If the problem persists, check that the sign-in method is enabled in the Firebase console.",
      code,
    );
  }
  if (haystack.includes("blocked") || haystack.includes("safety") || haystack.includes("finish_reason")) {
    return new AppError(
      "model_output",
      `${context}: the model did not return usable output (the response was blocked or empty).${suffix}`,
      "Rephrase the paper or question and try again. Nothing was saved from this run.",
      code,
    );
  }
  if (haystack.includes("on-device") || haystack.includes("device model") || haystack.includes("language model")) {
    return new AppError(
      "device_model",
      `${context}: the on-device model is not ready.${suffix}`,
      "Open the Status view and download the on-device model, or use a cloud-backed action instead.",
      code,
    );
  }
  return new AppError(
    "unknown",
    `${context}: ${message ? message : "an unexpected error occurred."}${suffix}`,
    "Try again. If the problem persists, note the reported code and check the Status view.",
    code,
  );
}
