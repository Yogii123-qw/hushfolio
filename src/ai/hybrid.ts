// Firebase AI Logic model factory: the single place where
// `getGenerativeModel` is called with hybrid parameters.
//
// Verified against the installed firebase@13.4.0 type definitions:
//   getGenerativeModel(ai, HybridParams)
//   HybridParams = { mode, onDeviceParams?: { createOptions?, promptOptions? },
//                    inCloudParams?: ModelParams }
//   inCloudParams = { model, generationConfig?: { responseMimeType, responseSchema, ... } }
//   onDeviceParams.promptOptions = { responseConstraint }
//   onDeviceParams.createOptions = { expectedInputs, expectedOutputs }
//
// The `modelCreator` parameter exists ONLY so unit tests can inject a
// recording double at the SDK boundary. Production code always uses the
// default, which calls the real SDK. No double ever ships in app code.

import {
  getGenerativeModel,
  type AI,
  type GenerativeModel,
  type HybridParams,
} from "firebase/ai";
import { AppError, toAppError } from "../errors";
import type { InferenceModeValue, InferenceSourceValue } from "../types";

export type ModelCreator = (ai: AI, params: HybridParams) => GenerativeModel;

export const defaultModelCreator: ModelCreator = (ai, params) => getGenerativeModel(ai, params);

export interface HybridModelConfig {
  mode: InferenceModeValue;
  cloudModel: string;
  /** Firebase Schema object for structured output (both inference paths). */
  schema?: object;
  /** True when the request includes an image part (multimodal on-device). */
  multimodal?: boolean;
}

export function createHybridModel(
  ai: AI,
  config: HybridModelConfig,
  creator: ModelCreator = defaultModelCreator,
): GenerativeModel {
  const params: HybridParams = {
    mode: config.mode,
    inCloudParams:
      config.schema !== undefined
        ? {
            model: config.cloudModel,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: config.schema as never,
            },
          }
        : { model: config.cloudModel },
    onDeviceParams: {
      ...(config.multimodal === true
        ? {
            createOptions: {
              expectedInputs: [{ type: "image" }, { type: "text", languages: ["en"] }],
              expectedOutputs: [{ type: "text", languages: ["en"] }],
            },
          }
        : {}),
      ...(config.schema !== undefined
        ? { promptOptions: { responseConstraint: config.schema } }
        : {}),
    },
  };
  return creator(ai, params);
}

/**
 * Start (or await) the on-device model download. MUST be called from a user
 * gesture — the caller is responsible for that; this wrapper only clamps
 * progress values and maps errors honestly.
 */
export async function downloadDeviceModel(
  model: GenerativeModel,
  onProgress: (fraction: number) => void,
): Promise<void> {
  try {
    await model.initializeDeviceModel((value: number) => {
      const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      onProgress(clamped);
    });
  } catch (error) {
    throw toAppError(error, "On-device model download failed");
  }
}

/** Read the inference source from a response, defaulting honestly to "none". */
export function readInferenceSource(response: {
  inferenceSource?: string;
}): InferenceSourceValue {
  if (response.inferenceSource === "on_device" || response.inferenceSource === "in_cloud") {
    return response.inferenceSource;
  }
  return "none";
}

/** Extract text from a response, failing honestly on empty output. */
export function requireResponseText(response: { text: () => string }, context: string): string {
  let text: string;
  try {
    text = response.text();
  } catch (error) {
    throw toAppError(error, context);
  }
  if (text.trim() === "") {
    throw new AppError(
      "model_output",
      `${context}: the model returned an empty response, so nothing was saved.`,
      "Try the action again with different wording.",
    );
  }
  return text;
}
