// Firebase App Check setup.
//
// Production: reCAPTCHA Enterprise provider with the site key from the
// environment. The key is registered in the Firebase console under the
// Fraud Defense (reCAPTCHA Enterprise) provider, so the SDK must use
// ReCaptchaEnterpriseProvider: a classic ReCaptchaV3Provider token is not
// accepted for an Enterprise-registered app, and AI Logic calls would be
// rejected while enforcement is on.
// Local development: when VITE_APPCHECK_DEBUG=true, the debug token global
// is set BEFORE initializeAppCheck, exactly as the official AI Logic
// get-started guide prescribes. The debug token printed in the browser
// console must be registered in Firebase console > App Check.
// No site key: App Check is skipped and the Status view says so honestly;
// cloud calls may then fail when enforcement is on.

import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { logInfo, logWarn } from "./logging";

export type AppCheckMode = "recaptcha" | "debug" | "skipped";

export interface AppCheckStatus {
  mode: AppCheckMode;
  detail: string;
}

export interface AppCheckOptions {
  siteKey: string | null;
  debug: boolean;
}

let initialized: AppCheck | null = null;

export function readAppCheckOptions(env: Record<string, string | undefined>): AppCheckOptions {
  const siteKey = env["VITE_APPCHECK_SITE_KEY"];
  return {
    siteKey: siteKey !== undefined && siteKey.trim() !== "" ? siteKey.trim() : null,
    debug: env["VITE_APPCHECK_DEBUG"] === "true",
  };
}

export function initAppCheckForApp(app: FirebaseApp, options: AppCheckOptions): AppCheckStatus {
  if (initialized !== null) {
    return {
      mode: options.siteKey !== null ? "recaptcha" : "skipped",
      detail: "App Check was already initialized for this page load.",
    };
  }
  if (options.debug) {
    // Documented debug flow: set the global BEFORE initializing App Check.
    (globalThis as unknown as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = true;
  }
  if (options.siteKey === null) {
    logWarn("appcheck_skipped", { reason: "no_site_key" });
    return {
      mode: "skipped",
      detail:
        "No reCAPTCHA Enterprise site key is configured (VITE_APPCHECK_SITE_KEY). " +
        "App Check is not active; cloud AI calls may be rejected while App Check enforcement is on.",
    };
  }
  initialized = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(options.siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  if (options.debug) {
    logInfo("appcheck_initialized", { mode: "debug" });
    return {
      mode: "debug",
      detail:
        "App Check debug provider is active. The debug token printed in the browser console " +
        "must be registered in Firebase console > App Check > Manage debug tokens.",
    };
  }
  logInfo("appcheck_initialized", { mode: "recaptcha" });
  return {
    mode: "recaptcha",
    detail: "App Check is active with the reCAPTCHA Enterprise provider.",
  };
}
