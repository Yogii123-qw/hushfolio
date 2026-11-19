// Shared domain types for Hushfolio.
// Firestore timestamps are converted to epoch milliseconds at the data
// layer boundary, so the rest of the app only ever deals in numbers.

export type InferenceModeValue =
  | "prefer_on_device"
  | "only_on_device"
  | "only_in_cloud"
  | "prefer_in_cloud";

export type InferenceSourceValue = "on_device" | "in_cloud" | "none";

export type ActionId =
  | "seal_scan"
  | "summarize"
  | "ask"
  | "photo_read"
  | "connect_dots";

export const ACTION_LABELS: Record<ActionId, string> = {
  seal_scan: "Seal Scan",
  summarize: "Summarize & file",
  ask: "Ask this paper",
  photo_read: "Photo read",
  connect_dots: "Connect the dots",
};

export type Mood = "calm" | "tense" | "hopeful" | "low" | "mixed" | "unknown";

export const MOODS: readonly Mood[] = [
  "calm",
  "tense",
  "hopeful",
  "low",
  "mixed",
  "unknown",
];

export type SensitivityLevel = "none" | "low" | "high";

export interface SensitivityInfo {
  level: SensitivityLevel;
  categories: string[];
  notes: string;
  redactedPreview: string;
  scannedAt: number;
  scannedOnDevice: boolean;
}

export interface PhotoMeta {
  name: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  readAt: number;
}

export interface Paper {
  id: string;
  title: string;
  body: string;
  tags: string[];
  mood: Mood;
  summary: string | null;
  sensitivity: SensitivityInfo | null;
  photo: PhotoMeta | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * A paper whose content could not be decrypted. The list and the paper
 * view render this as an honest placeholder, never silently skip it.
 * `locked` = no key in memory (unlock first); `corrupt` = the blob failed
 * authentication (wrong passphrase or tampered data).
 */
export interface LockedPaper {
  id: string;
  createdAt: number;
  updatedAt: number;
  reason: "locked" | "corrupt";
}

export function isLockedPaper(paper: Paper | LockedPaper): paper is LockedPaper {
  return "reason" in paper;
}

export interface PaperInput {
  title: string;
  body: string;
  tags: string[];
}

export interface LedgerEntry {
  id: string;
  action: ActionId;
  requestedMode: InferenceModeValue;
  inferenceSource: InferenceSourceValue;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
  paperId: string | null;
  createdAt: number;
}

export interface RemoteConfigValues {
  defaultMode: InferenceModeValue;
  strictModeDefault: boolean;
  cloudEnabled: boolean;
  maxPaperChars: number;
  pageSize: number;
  photoEnabled: boolean;
  cloudModel: string;
  promptVersion: string;
}

export type DeviceModelStatus =
  | "unknown"
  | "unsupported"
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available"
  | "error";

export interface DeviceProbeResult {
  status: DeviceModelStatus;
  /** Human-readable detail, safe to display. Never contains user content. */
  detail: string;
  /** Raw value reported by the browser, when one was reported. */
  raw: string | null;
}
