// ---------------------------------------------------------------------------
// TEST DOUBLE NOTICE: the fake model in this file is a TEST DOUBLE that
// exists ONLY in this test file. It is injected at the Firebase SDK
// boundary through the `modelCreator` parameter so the routing, parsing,
// streaming, and ledger logic can be verified without a Firebase project.
// Production code never sees this double: it always uses
// `defaultModelCreator`, which calls the real Firebase AI Logic SDK.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type { AI, GenerativeModel, HybridParams } from "firebase/ai";
import { runAiAction, type AiRuntime, type LedgerRecordInput } from "../src/ai/actions";
import {
  createHybridModel,
  defaultModelCreator,
  downloadDeviceModel,
  readInferenceSource,
  requireResponseText,
} from "../src/ai/hybrid";
import { AppError } from "../src/errors";
import { REMOTE_CONFIG_DEFAULTS } from "../src/platform/remoteconfig";
import type { InferenceSourceValue, Paper } from "../src/types";

function makePaper(id: string, title: string, body: string): Paper {
  return {
    id,
    title,
    body,
    tags: [],
    mood: "unknown",
    summary: null,
    sensitivity: null,
    photo: null,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

interface DoubleConfig {
  text: string;
  source: InferenceSourceValue;
  chunks?: string[];
  generateError?: unknown;
  progressValues?: number[];
  downloadError?: unknown;
}

interface DoubleModel {
  requests: unknown[];
  streamRequests: unknown[];
  progressSeen: number[];
  model: GenerativeModel;
}

/** Build a recording fake GenerativeModel. TEST ONLY — see the notice above. */
function makeDoubleModel(config: DoubleConfig): DoubleModel {
  const requests: unknown[] = [];
  const streamRequests: unknown[] = [];
  const progressSeen: number[] = [];
  const fakeResponse = {
    text: () => config.text,
    inferenceSource: config.source,
  };
  const model = {
    generateContent: async (request: unknown) => {
      requests.push(request);
      if (config.generateError !== undefined) {
        throw config.generateError;
      }
      return { response: fakeResponse };
    },
    generateContentStream: async (request: unknown) => {
      streamRequests.push(request);
      if (config.generateError !== undefined) {
        throw config.generateError;
      }
      const chunks = config.chunks ?? [config.text];
      async function* stream() {
        for (const chunk of chunks) {
          yield { text: () => chunk };
        }
      }
      return { stream: stream(), response: Promise.resolve(fakeResponse) };
    },
    initializeDeviceModel: async (onProgress?: (value: number) => void) => {
      if (config.downloadError !== undefined) {
        throw config.downloadError;
      }
      for (const value of config.progressValues ?? [0.5, 1]) {
        progressSeen.push(value);
        onProgress?.(value);
      }
    },
  } as unknown as GenerativeModel;
  return { requests, streamRequests, progressSeen, model };
}

function makeRuntime(
  doubleModel: GenerativeModel,
  recordLedger: (entry: LedgerRecordInput) => Promise<void>,
  overrides: Partial<AiRuntime> = {},
): { runtime: AiRuntime; seenParams: HybridParams[] } {
  const seenParams: HybridParams[] = [];
  const runtime: AiRuntime = {
    ai: {} as AI,
    config: REMOTE_CONFIG_DEFAULTS,
    strictMode: false,
    online: true,
    deviceAvailable: true,
    recordLedger,
    modelCreator: (_ai, params) => {
      seenParams.push(params);
      return doubleModel;
    },
    ...overrides,
  };
  return { runtime, seenParams };
}

const SUMMARY_JSON = JSON.stringify({ title: "T", summary: "S", tags: ["x"], mood: "calm" });
const SEAL_JSON = JSON.stringify({
  level: "low",
  categories: ["names"],
  notes: "Names found.",
  redactedPreview: "Met [NAME].",
});
const PHOTO_JSON = JSON.stringify({
  transcription: "Hello",
  description: "A note.",
  docType: "note",
  confidence: "high",
});
const CONNECTIONS_JSON = JSON.stringify({
  themes: ["family"],
  connections: [{ firstPaper: "A", secondPaper: "B", relation: "Both mention home." }],
  timeline: [],
});

describe("createHybridModel", () => {
  it("wires mode, cloud model, and structured output into both inference paths", () => {
    const seen: HybridParams[] = [];
    const schema = { type: "object" };
    createHybridModel({} as AI, { mode: "prefer_on_device", cloudModel: "gemini-3.5-flash-lite", schema }, (_ai, params) => {
      seen.push(params);
      return {} as GenerativeModel;
    });
    expect(seen).toHaveLength(1);
    const params = seen[0] as HybridParams & {
      inCloudParams?: { model?: string; generationConfig?: Record<string, unknown> };
      onDeviceParams?: { promptOptions?: { responseConstraint?: unknown } };
    };
    expect(params.mode).toBe("prefer_on_device");
    expect(params.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(params.inCloudParams?.generationConfig?.["responseMimeType"]).toBe("application/json");
    expect(params.inCloudParams?.generationConfig?.["responseSchema"]).toBe(schema);
    expect(params.onDeviceParams?.promptOptions?.responseConstraint).toBe(schema);
  });

  it("omits structured-output config when no schema is given", () => {
    const seen: HybridParams[] = [];
    createHybridModel({} as AI, { mode: "only_on_device", cloudModel: "gemini-3.5-flash-lite" }, (_ai, params) => {
      seen.push(params);
      return {} as GenerativeModel;
    });
    const params = seen[0] as HybridParams & {
      inCloudParams?: Record<string, unknown>;
      onDeviceParams?: Record<string, unknown>;
    };
    expect(params.inCloudParams).toEqual({ model: "gemini-3.5-flash-lite" });
    expect(params.onDeviceParams).toEqual({});
  });

  it("adds multimodal createOptions for photo input", () => {
    const seen: HybridParams[] = [];
    createHybridModel({} as AI, { mode: "prefer_on_device", cloudModel: "m", multimodal: true }, (_ai, params) => {
      seen.push(params);
      return {} as GenerativeModel;
    });
    const params = seen[0] as HybridParams & {
      onDeviceParams?: { createOptions?: { expectedInputs?: unknown[]; expectedOutputs?: unknown[] } };
    };
    expect(params.onDeviceParams?.createOptions?.expectedInputs).toContainEqual({ type: "image" });
    expect(params.onDeviceParams?.createOptions?.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });

  it("exposes the real-SDK creator as the production default", () => {
    expect(typeof defaultModelCreator).toBe("function");
  });
});

describe("downloadDeviceModel", () => {
  it("clamps progress values into 0..1", async () => {
    const double = makeDoubleModel({ text: "", source: "none", progressValues: [1.5, -0.25, 0.5] });
    const seen: number[] = [];
    await downloadDeviceModel(double.model, (fraction) => {
      seen.push(fraction);
    });
    expect(seen).toEqual([1, 0, 0.5]);
  });

  it("maps a download failure to an AppError", async () => {
    const double = makeDoubleModel({ text: "", source: "none", downloadError: new Error("network down") });
    await expect(downloadDeviceModel(double.model, () => {})).rejects.toBeInstanceOf(AppError);
  });
});

describe("readInferenceSource / requireResponseText", () => {
  it("reads on_device and in_cloud, and defaults anything else to none", () => {
    expect(readInferenceSource({ inferenceSource: "on_device" })).toBe("on_device");
    expect(readInferenceSource({ inferenceSource: "in_cloud" })).toBe("in_cloud");
    expect(readInferenceSource({ inferenceSource: "mystery" })).toBe("none");
    expect(readInferenceSource({})).toBe("none");
  });

  it("returns non-empty text", () => {
    expect(requireResponseText({ text: () => "hello" }, "ctx")).toBe("hello");
  });

  it("rejects empty text", () => {
    expect(() => requireResponseText({ text: () => "   " }, "ctx")).toThrow(AppError);
  });

  it("maps a throwing text() to an AppError", () => {
    expect(() =>
      requireResponseText(
        {
          text: () => {
            throw new Error("blocked");
          },
        },
        "ctx",
      ),
    ).toThrow(AppError);
  });
});

describe("runAiAction — seal_scan", () => {
  it("runs only_on_device, parses the result, and records a metadata-only ledger entry", async () => {
    const double = makeDoubleModel({ text: SEAL_JSON, source: "on_device" });
    const ledger: LedgerRecordInput[] = [];
    const { runtime, seenParams } = makeRuntime(double.model, async (entry) => {
      ledger.push(entry);
    });
    const result = await runAiAction(runtime, {
      action: "seal_scan",
      paper: makePaper("p1", "T", "Met Ana today."),
      consentGiven: false,
    });
    expect(result.action).toBe("seal_scan");
    if (result.action === "seal_scan") {
      expect(result.data.level).toBe("low");
      expect(result.data.redactedPreview).toBe("Met [NAME].");
    }
    expect(result.source).toBe("on_device");
    expect(result.ledgerRecorded).toBe(true);
    expect(seenParams[0]?.mode).toBe("only_on_device");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      action: "seal_scan",
      requestedMode: "only_on_device",
      inferenceSource: "on_device",
      ok: true,
      errorCode: null,
      paperId: "p1",
    });
    expect(ledger[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("refuses without touching the model or the ledger when the device model is not ready", async () => {
    const double = makeDoubleModel({ text: SEAL_JSON, source: "on_device" });
    const ledger: LedgerRecordInput[] = [];
    const { runtime, seenParams } = makeRuntime(
      double.model,
      async (entry) => {
        ledger.push(entry);
      },
      { deviceAvailable: false },
    );
    await expect(
      runAiAction(runtime, { action: "seal_scan", paper: makePaper("p1", "T", "body"), consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(seenParams).toHaveLength(0);
    expect(double.requests).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });
});

describe("runAiAction — summarize", () => {
  it("honors the actual inference source reported by the SDK", async () => {
    const double = makeDoubleModel({ text: SUMMARY_JSON, source: "in_cloud" });
    const ledger: LedgerRecordInput[] = [];
    const { runtime } = makeRuntime(double.model, async (entry) => {
      ledger.push(entry);
    });
    const result = await runAiAction(runtime, {
      action: "summarize",
      paper: makePaper("p1", "T", "body"),
      consentGiven: false,
    });
    expect(result.source).toBe("in_cloud");
    expect(ledger[0]?.inferenceSource).toBe("in_cloud");
  });

  it("forces only_on_device in Strict mode", async () => {
    const double = makeDoubleModel({ text: SUMMARY_JSON, source: "on_device" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {}, { strictMode: true });
    await runAiAction(runtime, { action: "summarize", paper: makePaper("p1", "T", "body"), consentGiven: false });
    expect(seenParams[0]?.mode).toBe("only_on_device");
  });

  it("records a failure ledger entry and discards invalid JSON", async () => {
    const double = makeDoubleModel({ text: "this is not json", source: "on_device" });
    const ledger: LedgerRecordInput[] = [];
    const { runtime } = makeRuntime(double.model, async (entry) => {
      ledger.push(entry);
    });
    await expect(
      runAiAction(runtime, { action: "summarize", paper: makePaper("p1", "T", "body"), consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ ok: false, inferenceSource: "none", errorCode: "model_output" });
  });

  it("still returns the result when the ledger write fails, flagged as unrecorded", async () => {
    const double = makeDoubleModel({ text: SUMMARY_JSON, source: "on_device" });
    const { runtime } = makeRuntime(double.model, async () => {
      throw new Error("firestore down");
    });
    const result = await runAiAction(runtime, {
      action: "summarize",
      paper: makePaper("p1", "T", "body"),
      consentGiven: false,
    });
    expect(result.ledgerRecorded).toBe(false);
    expect(result.action).toBe("summarize");
  });

  it("records the SDK error code on a model failure", async () => {
    const double = makeDoubleModel({
      text: "",
      source: "none",
      generateError: { code: "resource-exhausted", message: "Quota exceeded." },
    });
    const ledger: LedgerRecordInput[] = [];
    const { runtime } = makeRuntime(double.model, async (entry) => {
      ledger.push(entry);
    });
    await expect(
      runAiAction(runtime, { action: "summarize", paper: makePaper("p1", "T", "body"), consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(ledger[0]).toMatchObject({ ok: false, errorCode: "resource-exhausted", inferenceSource: "none" });
  });
});

describe("runAiAction — ask", () => {
  it("streams chunks in order and calls onStreamChunk for each", async () => {
    const double = makeDoubleModel({ text: "", source: "on_device", chunks: ["Hel", "lo", " there."] });
    const seenChunks: string[] = [];
    const { runtime } = makeRuntime(double.model, async () => {});
    const result = await runAiAction(runtime, {
      action: "ask",
      paper: makePaper("p1", "T", "The harbor was quiet."),
      question: "What was quiet?",
      consentGiven: false,
      onStreamChunk: (chunk) => {
        seenChunks.push(chunk);
      },
    });
    expect(result.action).toBe("ask");
    if (result.action === "ask") expect(result.data.answer).toBe("Hello there.");
    expect(seenChunks).toEqual(["Hel", "lo", " there."]);
    expect(double.streamRequests).toHaveLength(1);
    expect(double.requests).toHaveLength(0);
  });

  it("rejects an empty question before creating a model", async () => {
    const double = makeDoubleModel({ text: "", source: "on_device" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {});
    await expect(
      runAiAction(runtime, { action: "ask", paper: makePaper("p1", "T", "body"), question: "  ", consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(seenParams).toHaveLength(0);
  });

  it("rejects an empty streamed answer and records the failure", async () => {
    const double = makeDoubleModel({ text: "", source: "on_device", chunks: ["", "  "] });
    const ledger: LedgerRecordInput[] = [];
    const { runtime } = makeRuntime(double.model, async (entry) => {
      ledger.push(entry);
    });
    await expect(
      runAiAction(runtime, { action: "ask", paper: makePaper("p1", "T", "body"), question: "Q?", consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.ok).toBe(false);
  });
});

describe("runAiAction — photo_read", () => {
  it("sends the prompt plus an inlineData image part, with multimodal options", async () => {
    const double = makeDoubleModel({ text: PHOTO_JSON, source: "on_device" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {});
    const result = await runAiAction(runtime, {
      action: "photo_read",
      paper: makePaper("p1", "T", "body"),
      image: { base64: "BASE64DATA", mimeType: "image/png" },
      consentGiven: false,
    });
    expect(result.action).toBe("photo_read");
    if (result.action === "photo_read") expect(result.data.docType).toBe("note");
    expect(double.requests).toHaveLength(1);
    const request = double.requests[0] as Array<string | Record<string, unknown>>;
    expect(Array.isArray(request)).toBe(true);
    expect(request).toHaveLength(2);
    expect(request[1]).toEqual({
      type: "inlineData",
      inlineData: { data: "BASE64DATA", mimeType: "image/png" },
    });
    const params = seenParams[0] as HybridParams & {
      onDeviceParams?: { createOptions?: { expectedInputs?: unknown[] } };
    };
    expect(params.onDeviceParams?.createOptions?.expectedInputs).toContainEqual({ type: "image" });
  });

  it("requires an image before creating a model", async () => {
    const double = makeDoubleModel({ text: PHOTO_JSON, source: "on_device" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {});
    await expect(
      runAiAction(runtime, { action: "photo_read", paper: makePaper("p1", "T", "body"), consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(seenParams).toHaveLength(0);
  });
});

describe("runAiAction — connect_dots", () => {
  const papers = [makePaper("1", "Alpha", "body a"), makePaper("2", "Beta", "body b")];

  it("requires explicit consent before creating a model", async () => {
    const double = makeDoubleModel({ text: CONNECTIONS_JSON, source: "in_cloud" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {});
    await expect(
      runAiAction(runtime, { action: "connect_dots", paper: null, papers, consentGiven: false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(seenParams).toHaveLength(0);
    expect(double.requests).toHaveLength(0);
  });

  it("requires at least two papers", async () => {
    const double = makeDoubleModel({ text: CONNECTIONS_JSON, source: "in_cloud" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {});
    await expect(
      runAiAction(runtime, { action: "connect_dots", paper: null, papers: [papers[0] as Paper], consentGiven: true }),
    ).rejects.toBeInstanceOf(AppError);
    expect(seenParams).toHaveLength(0);
  });

  it("runs prefer_in_cloud with all papers in the prompt and a null paperId in the ledger", async () => {
    const double = makeDoubleModel({ text: CONNECTIONS_JSON, source: "in_cloud" });
    const ledger: LedgerRecordInput[] = [];
    const { runtime, seenParams } = makeRuntime(double.model, async (entry) => {
      ledger.push(entry);
    });
    const result = await runAiAction(runtime, { action: "connect_dots", paper: null, papers, consentGiven: true });
    expect(result.action).toBe("connect_dots");
    expect(seenParams[0]?.mode).toBe("prefer_in_cloud");
    expect(double.requests[0] as string).toContain("Alpha");
    expect(double.requests[0] as string).toContain("Beta");
    expect(ledger[0]?.paperId).toBeNull();
  });

  it("is blocked in Strict mode before any model call", async () => {
    const double = makeDoubleModel({ text: CONNECTIONS_JSON, source: "in_cloud" });
    const { runtime, seenParams } = makeRuntime(double.model, async () => {}, { strictMode: true });
    await expect(
      runAiAction(runtime, { action: "connect_dots", paper: null, papers, consentGiven: true }),
    ).rejects.toBeInstanceOf(AppError);
    expect(seenParams).toHaveLength(0);
  });
});

describe("runAiAction — prompt version", () => {
  it("runs with an unknown prompt version by falling back to v1", async () => {
    const double = makeDoubleModel({ text: SUMMARY_JSON, source: "on_device" });
    const { runtime } = makeRuntime(double.model, async () => {}, {
      config: { ...REMOTE_CONFIG_DEFAULTS, promptVersion: "v99" },
    });
    const result = await runAiAction(runtime, {
      action: "summarize",
      paper: makePaper("p1", "T", "body"),
      consentGiven: false,
    });
    expect(result.action).toBe("summarize");
  });
});
