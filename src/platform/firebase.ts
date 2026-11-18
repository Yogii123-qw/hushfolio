// Firebase initialization. Configuration comes ONLY from environment
// variables (Vite `import.meta.env`). There are no fallback keys and no
// hard-coded project identifiers anywhere in the source.

import { getAI, GoogleAIBackend, type AI } from "firebase/ai";
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getRemoteConfig, type RemoteConfig } from "firebase/remote-config";
import { AppError } from "../errors";
import { logInfo } from "./logging";

export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string | null;
}

const REQUIRED_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export type EnvReadResult =
  | { ok: true; config: FirebaseEnvConfig }
  | { ok: false; missing: string[] };

/** Pure env reader, so tests can exercise it without Vite. */
export function readEnvConfig(env: Record<string, string | undefined>): EnvReadResult {
  const missing = REQUIRED_ENV_KEYS.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });
  if (missing.length > 0) {
    return { ok: false, missing: [...missing] };
  }
  const measurementId = env["VITE_FIREBASE_MEASUREMENT_ID"];
  return {
    ok: true,
    config: {
      apiKey: env["VITE_FIREBASE_API_KEY"] as string,
      authDomain: env["VITE_FIREBASE_AUTH_DOMAIN"] as string,
      projectId: env["VITE_FIREBASE_PROJECT_ID"] as string,
      storageBucket: env["VITE_FIREBASE_STORAGE_BUCKET"] as string,
      messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"] as string,
      appId: env["VITE_FIREBASE_APP_ID"] as string,
      measurementId: measurementId !== undefined && measurementId.trim() !== "" ? measurementId : null,
    },
  };
}

export function readBrowserEnvConfig(): EnvReadResult {
  return readEnvConfig(import.meta.env as unknown as Record<string, string | undefined>);
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  ai: AI;
  remoteConfig: RemoteConfig;
  projectId: string;
}

let cachedServices: FirebaseServices | null = null;

/**
 * Initialize (once) the Firebase app and its services. The Gemini Developer
 * API backend is used for AI Logic, per the official get-started guide:
 * it lets the app start at no cost. App Check must be initialized by the
 * caller BEFORE this function is used for AI calls; see appcheck.ts.
 */
export function initServices(config: FirebaseEnvConfig): FirebaseServices {
  if (cachedServices !== null && cachedServices.projectId === config.projectId) {
    return cachedServices;
  }
  const options: FirebaseOptions = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    ...(config.measurementId !== null ? { measurementId: config.measurementId } : {}),
  };
  const existing = getApps();
  const app = existing.length > 0 ? getApp() : initializeApp(options);
  if (app.options.projectId !== config.projectId) {
    throw new AppError(
      "config",
      `A Firebase app for project "${String(app.options.projectId)}" is already initialized, but the environment config names project "${config.projectId}".`,
      "Reload the page with a single consistent .env configuration.",
    );
  }
  const services: FirebaseServices = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    ai: getAI(app, { backend: new GoogleAIBackend() }),
    remoteConfig: getRemoteConfig(app),
    projectId: config.projectId,
  };
  cachedServices = services;
  logInfo("firebase_initialized", { projectId: config.projectId });
  return services;
}
