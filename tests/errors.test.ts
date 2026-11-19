import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "../src/errors";

describe("toAppError", () => {
  it("passes AppError instances through unchanged", () => {
    const original = new AppError("quota", "Quota hit.", "Wait.", "resource-exhausted");
    expect(toAppError(original, "Context")).toBe(original);
  });

  it("classifies permission-denied as permission and preserves the code", () => {
    const error = toAppError({ code: "permission-denied", message: "Missing permissions." }, "Loading papers");
    expect(error.kind).toBe("permission");
    expect(error.code).toBe("permission-denied");
    expect(error.message).toContain("permission-denied");
    expect(error.nextStep).toMatch(/firestore.rules/i);
  });

  it("classifies App Check rejections as permission", () => {
    const error = toAppError({ code: "failed-precondition", message: "App Check failed." }, "AI call");
    expect(error.kind).toBe("permission");
    expect(error.nextStep).toMatch(/App Check/i);
  });

  it("classifies quota and 429 errors as quota", () => {
    expect(toAppError({ code: "resource-exhausted", message: "Quota exceeded." }, "AI call").kind).toBe("quota");
    expect(toAppError(new Error("HTTP 429 too many requests"), "AI call").kind).toBe("quota");
  });

  it("classifies the Gemini free-tier 403 as a billing plan gate, not a network failure", () => {
    // Verbatim SDK error text captured live 19 Nov 2026. Note the trap:
    // "Error fetching from" would match the network branch if this branch
    // did not run first.
    const sdkError = {
      code: "fetch-error",
      message:
        "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/hushfolio-133fb/models/gemini-3.5-flash-lite:generateContent: [403 ] The Gemini API free tier is not available for this project. To use the Gemini API, please set up billing to upgrade to the paid tier at https://aistudio.google.com/billing.",
    };
    const error = toAppError(sdkError, "AI action failed");
    expect(error.kind).toBe("quota");
    expect(error.message).toMatch(/Blaze billing plan/i);
    expect(error.message).toMatch(/free tier is not available/i);
    expect(error.message).not.toMatch(/network request failed/i);
    expect(error.nextStep).toMatch(/Blaze plan/i);
    expect(error.code).toBe("fetch-error");
  });

  it("classifies network failures as network", () => {
    expect(toAppError(new Error("Failed to fetch"), "Loading").kind).toBe("network");
    expect(toAppError(new Error("You are offline"), "Loading").kind).toBe("network");
  });

  it("classifies auth/ codes as auth", () => {
    const error = toAppError({ code: "auth/popup-closed-by-user", message: "closed" }, "Sign-in");
    expect(error.kind).toBe("auth");
  });

  it("classifies blocked model output as model_output", () => {
    expect(toAppError(new Error("Response blocked by safety filters"), "AI call").kind).toBe("model_output");
  });

  it("classifies on-device model errors as device_model", () => {
    expect(toAppError(new Error("The on-device model is not downloaded"), "Scan").kind).toBe("device_model");
  });

  it("falls back to unknown with the original message and code, inventing nothing", () => {
    const error = toAppError({ code: "weird-code-123", message: "Something odd happened." }, "Doing a thing");
    expect(error.kind).toBe("unknown");
    expect(error.code).toBe("weird-code-123");
    expect(error.message).toContain("Something odd happened.");
    expect(error.message).toContain("weird-code-123");
  });

  it("handles non-Error thrown values", () => {
    const error = toAppError("a plain string failure", "Context");
    expect(error.kind).toBe("unknown");
    expect(error.message).toContain("a plain string failure");
  });

  it("handles an empty thrown object", () => {
    const error = toAppError({}, "Context");
    expect(error.kind).toBe("unknown");
    expect(error.message).toContain("unexpected error");
  });
});
