import { describe, expect, it } from "vitest";
import { decideRoute, modeExplanation, routeInputFromConfig, type RouteInput } from "../src/ai/routing";
import { REMOTE_CONFIG_DEFAULTS } from "../src/platform/remoteconfig";
import type { ActionId, InferenceModeValue } from "../src/types";

const ACTIONS: ActionId[] = ["seal_scan", "summarize", "ask", "photo_read", "connect_dots"];
const MODES: InferenceModeValue[] = ["prefer_on_device", "only_on_device", "only_in_cloud", "prefer_in_cloud"];

function base(overrides: Partial<RouteInput>): RouteInput {
  return {
    action: "summarize",
    strictMode: false,
    online: true,
    deviceAvailable: true,
    cloudEnabled: true,
    defaultMode: "prefer_on_device",
    ...overrides,
  };
}

describe("decideRoute — Seal Scan invariant", () => {
  it("routes seal_scan to only_on_device for every combination of flags when the device model is ready", () => {
    for (const strictMode of [false, true]) {
      for (const online of [false, true]) {
        for (const cloudEnabled of [false, true]) {
          for (const defaultMode of MODES) {
            const decision = decideRoute(base({ action: "seal_scan", strictMode, online, cloudEnabled, defaultMode, deviceAvailable: true }));
            expect(decision).toEqual({ blocked: false, mode: "only_on_device" });
          }
        }
      }
    }
  });

  it("blocks seal_scan honestly when the device model is not ready, never falling back to cloud", () => {
    for (const strictMode of [false, true]) {
      for (const online of [false, true]) {
        for (const cloudEnabled of [false, true]) {
          for (const defaultMode of MODES) {
            const decision = decideRoute(base({ action: "seal_scan", strictMode, online, cloudEnabled, defaultMode, deviceAvailable: false }));
            expect(decision.blocked).toBe(true);
            if (decision.blocked) {
              expect(decision.reason).toMatch(/on-device model/i);
              expect(decision.nextStep.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });
});

describe("decideRoute — Connect the dots", () => {
  it("is blocked by Strict mode", () => {
    const decision = decideRoute(base({ action: "connect_dots", strictMode: true }));
    expect(decision.blocked).toBe(true);
    if (decision.blocked) expect(decision.reason).toMatch(/Strict mode/i);
  });

  it("is blocked when cloud is disabled", () => {
    const decision = decideRoute(base({ action: "connect_dots", cloudEnabled: false }));
    expect(decision.blocked).toBe(true);
  });

  it("uses prefer_in_cloud when allowed, including offline (SDK falls back on-device)", () => {
    expect(decideRoute(base({ action: "connect_dots", online: true }))).toEqual({ blocked: false, mode: "prefer_in_cloud" });
    expect(decideRoute(base({ action: "connect_dots", online: false }))).toEqual({ blocked: false, mode: "prefer_in_cloud" });
    expect(decideRoute(base({ action: "connect_dots", online: false, deviceAvailable: false }))).toEqual({
      blocked: false,
      mode: "prefer_in_cloud",
    });
  });
});

describe("decideRoute — summarize, ask, photo_read", () => {
  for (const action of ["summarize", "ask", "photo_read"] as const) {
    it(`${action}: strict mode forces only_on_device when the device model is ready`, () => {
      expect(decideRoute(base({ action, strictMode: true }))).toEqual({ blocked: false, mode: "only_on_device" });
    });

    it(`${action}: strict mode blocks when the device model is not ready`, () => {
      expect(decideRoute(base({ action, strictMode: true, deviceAvailable: false })).blocked).toBe(true);
    });

    it(`${action}: offline forces only_on_device when the device model is ready`, () => {
      expect(decideRoute(base({ action, online: false }))).toEqual({ blocked: false, mode: "only_on_device" });
    });

    it(`${action}: offline without a device model blocks with an offline-specific reason`, () => {
      const decision = decideRoute(base({ action, online: false, deviceAvailable: false }));
      expect(decision.blocked).toBe(true);
      if (decision.blocked) expect(decision.reason).toMatch(/offline/i);
    });

    it(`${action}: cloud disabled forces only_on_device when the device model is ready`, () => {
      expect(decideRoute(base({ action, cloudEnabled: false }))).toEqual({ blocked: false, mode: "only_on_device" });
    });

    it(`${action}: honors the configured default mode when online, not strict, and cloud enabled`, () => {
      for (const defaultMode of MODES) {
        expect(decideRoute(base({ action, defaultMode }))).toEqual({ blocked: false, mode: defaultMode });
      }
    });
  }
});

describe("modeExplanation", () => {
  it("explains all four modes in plain language", () => {
    const explanations = MODES.map(modeExplanation);
    expect(new Set(explanations).size).toBe(4);
    expect(modeExplanation("only_on_device")).toMatch(/only on this device/i);
    expect(modeExplanation("prefer_on_device")).toMatch(/otherwise uses the cloud/i);
    expect(modeExplanation("prefer_in_cloud")).toMatch(/falls back to this device/i);
    expect(modeExplanation("only_in_cloud")).toMatch(/only in the cloud/i);
  });
});

describe("routeInputFromConfig", () => {
  it("maps Remote Config values onto the route input", () => {
    const input = routeInputFromConfig("ask", { ...REMOTE_CONFIG_DEFAULTS, defaultMode: "only_in_cloud", cloudEnabled: false }, true, false, true);
    expect(input).toEqual({
      action: "ask",
      strictMode: true,
      online: false,
      deviceAvailable: true,
      cloudEnabled: false,
      defaultMode: "only_in_cloud",
    });
  });

  it("covers every action id", () => {
    for (const action of ACTIONS) {
      const input = routeInputFromConfig(action, REMOTE_CONFIG_DEFAULTS, false, true, true);
      expect(input.action).toBe(action);
    }
  });
});
