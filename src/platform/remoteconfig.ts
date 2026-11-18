// Remote Config: routing policy, limits, and prompt version, controlled
// from the Firebase console without redeploying. Every value is validated
// before use; an invalid remote value falls back to the bundled default
// and is reported in the Status view. A failed fetch never blocks the app:
// defaults are used and the failure is reported honestly.

import {
  fetchAndActivate,
  getBoolean,
  getNumber,
  getString,
  type RemoteConfig,
} from "firebase/remote-config";
import type { InferenceModeValue, RemoteConfigValues } from "../types";
import { logInfo, logWarn } from "./logging";

export const REMOTE_CONFIG_DEFAULTS: RemoteConfigValues = {
  defaultMode: "prefer_on_device",
  strictModeDefault: false,
  cloudEnabled: true,
  maxPaperChars: 20000,
  pageSize: 12,
  photoEnabled: true,
  cloudModel: "gemini-3.5-flash-lite",
  promptVersion: "v1",
};

const VALID_MODES: readonly InferenceModeValue[] = [
  "prefer_on_device",
  "only_on_device",
  "only_in_cloud",
  "prefer_in_cloud",
];

export interface ParsedRemoteConfig {
  values: RemoteConfigValues;
  /** Keys whose remote value was present but invalid (default used). */
  invalidKeys: string[];
}

/** Pure parser: raw Remote Config string/number/boolean values in, validated values out. */
export function parseRemoteConfigValues(
  raw: Record<string, string | number | boolean | undefined>,
): ParsedRemoteConfig {
  const invalidKeys: string[] = [];
  const values: RemoteConfigValues = { ...REMOTE_CONFIG_DEFAULTS };

  const rawMode = raw["default_mode"];
  if (typeof rawMode === "string" && (VALID_MODES as readonly string[]).includes(rawMode)) {
    values.defaultMode = rawMode as InferenceModeValue;
  } else if (rawMode !== undefined) {
    invalidKeys.push("default_mode");
  }

  const rawStrict = raw["strict_mode_default"];
  if (typeof rawStrict === "boolean") {
    values.strictModeDefault = rawStrict;
  } else if (rawStrict !== undefined) {
    invalidKeys.push("strict_mode_default");
  }

  const rawCloud = raw["cloud_enabled"];
  if (typeof rawCloud === "boolean") {
    values.cloudEnabled = rawCloud;
  } else if (rawCloud !== undefined) {
    invalidKeys.push("cloud_enabled");
  }

  const rawMax = raw["max_paper_chars"];
  if (typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax >= 1000 && rawMax <= 50000) {
    values.maxPaperChars = Math.floor(rawMax);
  } else if (rawMax !== undefined) {
    invalidKeys.push("max_paper_chars");
  }

  const rawPage = raw["page_size"];
  if (typeof rawPage === "number" && Number.isFinite(rawPage) && rawPage >= 5 && rawPage <= 50) {
    values.pageSize = Math.floor(rawPage);
  } else if (rawPage !== undefined) {
    invalidKeys.push("page_size");
  }

  const rawPhoto = raw["photo_enabled"];
  if (typeof rawPhoto === "boolean") {
    values.photoEnabled = rawPhoto;
  } else if (rawPhoto !== undefined) {
    invalidKeys.push("photo_enabled");
  }

  const rawModel = raw["cloud_model"];
  if (typeof rawModel === "string" && rawModel.trim() !== "" && rawModel.length <= 120) {
    values.cloudModel = rawModel.trim();
  } else if (rawModel !== undefined) {
    invalidKeys.push("cloud_model");
  }

  const rawPrompt = raw["prompt_version"];
  if (typeof rawPrompt === "string" && /^v[0-9]+$/.test(rawPrompt)) {
    values.promptVersion = rawPrompt;
  } else if (rawPrompt !== undefined) {
    invalidKeys.push("prompt_version");
  }

  return { values, invalidKeys };
}

export interface RemoteConfigLoadResult extends ParsedRemoteConfig {
  fetched: boolean;
  fetchErrorCode: string | null;
}

export async function loadRemoteConfigValues(remoteConfig: RemoteConfig): Promise<RemoteConfigLoadResult> {
  remoteConfig.defaultConfig = {
    default_mode: REMOTE_CONFIG_DEFAULTS.defaultMode,
    strict_mode_default: REMOTE_CONFIG_DEFAULTS.strictModeDefault,
    cloud_enabled: REMOTE_CONFIG_DEFAULTS.cloudEnabled,
    max_paper_chars: REMOTE_CONFIG_DEFAULTS.maxPaperChars,
    page_size: REMOTE_CONFIG_DEFAULTS.pageSize,
    photo_enabled: REMOTE_CONFIG_DEFAULTS.photoEnabled,
    cloud_model: REMOTE_CONFIG_DEFAULTS.cloudModel,
    prompt_version: REMOTE_CONFIG_DEFAULTS.promptVersion,
  };
  remoteConfig.settings = {
    minimumFetchIntervalMillis: 60_000,
    fetchTimeoutMillis: 10_000,
  };

  let fetched = false;
  let fetchErrorCode: string | null = null;
  try {
    fetched = await fetchAndActivate(remoteConfig);
    logInfo("remote_config_fetch", { fetched });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && typeof (error as Record<string, unknown>)["code"] === "string"
        ? ((error as Record<string, unknown>)["code"] as string)
        : "unknown";
    fetchErrorCode = code;
    logWarn("remote_config_fetch_failed", { code });
  }

  const parsed = parseRemoteConfigValues({
    default_mode: getString(remoteConfig, "default_mode"),
    strict_mode_default: getBoolean(remoteConfig, "strict_mode_default"),
    cloud_enabled: getBoolean(remoteConfig, "cloud_enabled"),
    max_paper_chars: getNumber(remoteConfig, "max_paper_chars"),
    page_size: getNumber(remoteConfig, "page_size"),
    photo_enabled: getBoolean(remoteConfig, "photo_enabled"),
    cloud_model: getString(remoteConfig, "cloud_model"),
    prompt_version: getString(remoteConfig, "prompt_version"),
  });
  return { ...parsed, fetched, fetchErrorCode };
}
