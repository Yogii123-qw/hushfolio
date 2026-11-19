// On-device model availability probe, using the Chrome Prompt API surface
// (`LanguageModel.availability()`). This probe NEVER triggers a model
// download - only the Firebase SDK's `initializeDeviceModel()`, called from
// an explicit user gesture, can start one. Results are browser-reported
// and are labeled as such in the UI.

import type { DeviceProbeResult } from "../types";

interface LanguageModelGlobal {
  availability: (options?: Record<string, unknown>) => Promise<string>;
}

function readLanguageModelGlobal(): LanguageModelGlobal | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)["LanguageModel"];
  if (typeof candidate === "object" && candidate !== null) {
    const availability = (candidate as Record<string, unknown>)["availability"];
    if (typeof availability === "function") {
      return candidate as unknown as LanguageModelGlobal;
    }
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("availability probe timed out"));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function probeDeviceModel(timeoutMs = 5000): Promise<DeviceProbeResult> {
  const languageModel = readLanguageModelGlobal();
  if (languageModel === null) {
    return {
      status: "unsupported",
      detail:
        "This browser does not expose the on-device Prompt API. On-device inference needs Chrome on desktop, version 139 or higher.",
      raw: null,
    };
  }
  try {
    const raw = await withTimeout(languageModel.availability(), timeoutMs);
    switch (raw) {
      case "available":
        return {
          status: "available",
          detail: "The on-device model is downloaded and ready. This status was reported by the browser.",
          raw,
        };
      case "downloading":
        return {
          status: "downloading",
          detail: "The on-device model is currently downloading in this browser.",
          raw,
        };
      case "downloadable":
        return {
          status: "downloadable",
          detail: "The on-device model can be downloaded. Use the download button in the Status view.",
          raw,
        };
      case "unavailable":
        return {
          status: "unavailable",
          detail: "The browser reports the on-device model as unavailable on this device.",
          raw,
        };
      default:
        return {
          status: "unknown",
          detail: `The browser reported an unrecognized availability value: ${raw}.`,
          raw,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      detail: `The availability check failed: ${message}`,
      raw: null,
    };
  }
}
