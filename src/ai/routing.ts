// Hybrid routing decisions, as a pure function.
//
// The decision table is the privacy guarantee of the whole product, so it
// lives here — testable, side-effect free — and nowhere else. In
// particular, Seal Scan can NEVER be routed to the cloud: no combination
// of Remote Config, Strict mode, or connectivity changes that invariant.

import type { ActionId, InferenceModeValue, RemoteConfigValues } from "../types";

export interface RouteInput {
  action: ActionId;
  strictMode: boolean;
  online: boolean;
  /** True only when the browser reports the on-device model as ready. */
  deviceAvailable: boolean;
  cloudEnabled: boolean;
  defaultMode: InferenceModeValue;
}

export type RouteDecision =
  | { blocked: false; mode: InferenceModeValue }
  | { blocked: true; reason: string; nextStep: string };

const DEVICE_NOT_READY: RouteDecision = {
  blocked: true,
  reason: "The on-device model is not ready in this browser.",
  nextStep: "Open the Status view to download the on-device model, then try again.",
};

export function decideRoute(input: RouteInput): RouteDecision {
  const { action, strictMode, online, deviceAvailable, cloudEnabled, defaultMode } = input;

  // Seal Scan is the privacy invariant: on-device only, always. A missing
  // on-device model is an honest refusal, never a silent cloud fallback.
  if (action === "seal_scan") {
    if (!deviceAvailable) {
      return DEVICE_NOT_READY;
    }
    return { blocked: false, mode: "only_on_device" };
  }

  // Connect the dots is the one deliberately cloud-first action. Strict
  // mode and the Remote Config master switch both forbid it outright.
  if (action === "connect_dots") {
    if (strictMode) {
      return {
        blocked: true,
        reason: "Strict mode is on, so cloud-backed analysis is disabled.",
        nextStep: "Turn Strict mode off in Settings to use Connect the dots.",
      };
    }
    if (!cloudEnabled) {
      return {
        blocked: true,
        reason: "Cloud-backed analysis is currently disabled for this app.",
        nextStep: "Cloud access is controlled from Remote Config. Try the on-device actions instead.",
      };
    }
    // Offline is NOT a blocker: PREFER_IN_CLOUD falls back to the on-device
    // model when the device is offline (documented SDK semantics), and the
    // result is labeled with its actual inference source.
    return { blocked: false, mode: "prefer_in_cloud" };
  }

  // Remaining actions: summarize, ask, photo_read.
  if (strictMode || !online || !cloudEnabled) {
    // No cloud path is acceptable: on-device only, or an honest refusal.
    if (!deviceAvailable) {
      if (!online) {
        return {
          blocked: true,
          reason: "You are offline and the on-device model is not ready.",
          nextStep: "Reconnect to use cloud fallback, or download the on-device model from the Status view.",
        };
      }
      return DEVICE_NOT_READY;
    }
    return { blocked: false, mode: "only_on_device" };
  }

  // Online, not strict, cloud enabled: honor the operator's default mode.
  // deviceAvailable does not gate this branch — every mode except
  // ONLY_ON_DEVICE has a working fallback path by construction.
  return { blocked: false, mode: defaultMode };
}

/** Plain-language explanation of a mode, shown before the user runs an action. */
export function modeExplanation(mode: InferenceModeValue): string {
  switch (mode) {
    case "only_on_device":
      return "Runs only on this device. Nothing leaves the browser.";
    case "prefer_on_device":
      return "Runs on this device when the model is ready; otherwise uses the cloud model.";
    case "prefer_in_cloud":
      return "Runs in the cloud when online; falls back to this device when offline.";
    case "only_in_cloud":
      return "Runs only in the cloud. Content leaves this device.";
  }
}

export function routeInputFromConfig(
  action: ActionId,
  values: RemoteConfigValues,
  strictMode: boolean,
  online: boolean,
  deviceAvailable: boolean,
): RouteInput {
  return {
    action,
    strictMode,
    online,
    deviceAvailable,
    cloudEnabled: values.cloudEnabled,
    defaultMode: values.defaultMode,
  };
}
