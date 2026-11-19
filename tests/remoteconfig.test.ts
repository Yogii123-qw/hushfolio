import { describe, expect, it } from "vitest";
import { readAppCheckOptions } from "../src/platform/appcheck";
import { readEnvConfig } from "../src/platform/firebase";
import { parseRemoteConfigValues, REMOTE_CONFIG_DEFAULTS } from "../src/platform/remoteconfig";

describe("parseRemoteConfigValues", () => {
  it("returns defaults with no invalid keys for an empty raw map", () => {
    expect(parseRemoteConfigValues({})).toEqual({ values: REMOTE_CONFIG_DEFAULTS, invalidKeys: [] });
  });

  it("applies every valid value", () => {
    const { values, invalidKeys } = parseRemoteConfigValues({
      default_mode: "only_in_cloud",
      strict_mode_default: true,
      cloud_enabled: false,
      max_paper_chars: 5000,
      page_size: 20,
      photo_enabled: false,
      cloud_model: "gemini-3.5-flash",
      prompt_version: "v2",
    });
    expect(invalidKeys).toEqual([]);
    expect(values).toEqual({
      defaultMode: "only_in_cloud",
      strictModeDefault: true,
      cloudEnabled: false,
      maxPaperChars: 5000,
      pageSize: 20,
      photoEnabled: false,
      cloudModel: "gemini-3.5-flash",
      promptVersion: "v2",
    });
  });

  it("rejects an unknown default mode and keeps the default", () => {
    const { values, invalidKeys } = parseRemoteConfigValues({ default_mode: "sometimes_cloud" });
    expect(values.defaultMode).toBe(REMOTE_CONFIG_DEFAULTS.defaultMode);
    expect(invalidKeys).toEqual(["default_mode"]);
  });

  it("rejects wrong-typed booleans", () => {
    const { values, invalidKeys } = parseRemoteConfigValues({ strict_mode_default: "yes", cloud_enabled: 1 });
    expect(values.strictModeDefault).toBe(false);
    expect(values.cloudEnabled).toBe(true);
    expect(invalidKeys).toEqual(expect.arrayContaining(["strict_mode_default", "cloud_enabled"]));
  });

  it("enforces max_paper_chars bounds 1000-50000", () => {
    expect(parseRemoteConfigValues({ max_paper_chars: 1000 }).invalidKeys).toEqual([]);
    expect(parseRemoteConfigValues({ max_paper_chars: 50000 }).invalidKeys).toEqual([]);
    expect(parseRemoteConfigValues({ max_paper_chars: 999 }).invalidKeys).toEqual(["max_paper_chars"]);
    expect(parseRemoteConfigValues({ max_paper_chars: 50001 }).invalidKeys).toEqual(["max_paper_chars"]);
    expect(parseRemoteConfigValues({ max_paper_chars: 1234.9 }).values.maxPaperChars).toBe(1234);
  });

  it("enforces page_size bounds 5-50", () => {
    expect(parseRemoteConfigValues({ page_size: 5 }).invalidKeys).toEqual([]);
    expect(parseRemoteConfigValues({ page_size: 50 }).invalidKeys).toEqual([]);
    expect(parseRemoteConfigValues({ page_size: 4 }).invalidKeys).toEqual(["page_size"]);
    expect(parseRemoteConfigValues({ page_size: 51 }).invalidKeys).toEqual(["page_size"]);
  });

  it("rejects an empty or overlong cloud model name", () => {
    expect(parseRemoteConfigValues({ cloud_model: "  " }).invalidKeys).toEqual(["cloud_model"]);
    expect(parseRemoteConfigValues({ cloud_model: "m".repeat(121) }).invalidKeys).toEqual(["cloud_model"]);
    expect(parseRemoteConfigValues({ cloud_model: "  gemini-x  " }).values.cloudModel).toBe("gemini-x");
  });

  it("rejects a malformed prompt version", () => {
    expect(parseRemoteConfigValues({ prompt_version: "latest" }).invalidKeys).toEqual(["prompt_version"]);
    expect(parseRemoteConfigValues({ prompt_version: "v10" }).invalidKeys).toEqual([]);
  });
});

describe("readEnvConfig", () => {
  const full = {
    VITE_FIREBASE_API_KEY: "key",
    VITE_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "proj",
    VITE_FIREBASE_STORAGE_BUCKET: "proj.appspot.com",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
    VITE_FIREBASE_APP_ID: "1:123:web:abc",
  };

  it("accepts a complete environment", () => {
    const result = readEnvConfig(full);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.projectId).toBe("proj");
      expect(result.config.measurementId).toBeNull();
    }
  });

  it("reads the optional measurement id", () => {
    const result = readEnvConfig({ ...full, VITE_FIREBASE_MEASUREMENT_ID: "G-ABC" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.measurementId).toBe("G-ABC");
  });

  it("lists every missing key", () => {
    const result = readEnvConfig({ VITE_FIREBASE_API_KEY: "key" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toHaveLength(5);
      expect(result.missing).toContain("VITE_FIREBASE_PROJECT_ID");
    }
  });

  it("treats whitespace-only values as missing", () => {
    const result = readEnvConfig({ ...full, VITE_FIREBASE_API_KEY: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["VITE_FIREBASE_API_KEY"]);
  });
});

describe("readAppCheckOptions", () => {
  it("reads and trims the site key", () => {
    expect(readAppCheckOptions({ VITE_APPCHECK_SITE_KEY: "  site-key  " })).toEqual({ siteKey: "site-key", debug: false });
  });

  it("reports no site key when absent or blank", () => {
    expect(readAppCheckOptions({})).toEqual({ siteKey: null, debug: false });
    expect(readAppCheckOptions({ VITE_APPCHECK_SITE_KEY: "  " }).siteKey).toBeNull();
  });

  it("enables debug only on the exact string 'true'", () => {
    expect(readAppCheckOptions({ VITE_APPCHECK_DEBUG: "true" }).debug).toBe(true);
    expect(readAppCheckOptions({ VITE_APPCHECK_DEBUG: "1" }).debug).toBe(false);
    expect(readAppCheckOptions({ VITE_APPCHECK_DEBUG: "TRUE" }).debug).toBe(false);
  });
});
