// AI action orchestration: routing decision -> model -> SDK call ->
// parse/validate -> ledger record -> typed result.
//
// Every run records a ledger entry with metadata ONLY (action, requested
// mode, actual inference source, duration, outcome). Prompts and model
// outputs are never written to the ledger. If the ledger write itself
// fails, the action result still stands and `ledgerRecorded` is false,
// so the UI can say so instead of pretending the audit trail is complete.

import type { AI, GenerativeModel, Part } from "firebase/ai";
import { AppError, toAppError } from "../errors";
import { logError, logInfo, logWarn } from "../platform/logging";
import type {
  ActionId,
  InferenceModeValue,
  InferenceSourceValue,
  Paper,
  RemoteConfigValues,
} from "../types";
import { createHybridModel, defaultModelCreator, readInferenceSource, requireResponseText, type ModelCreator } from "./hybrid";
import {
  buildAskPrompt,
  buildConnectionsPrompt,
  buildPhotoPrompt,
  buildSensitivityPrompt,
  buildSummaryPrompt,
  resolvePromptVersion,
} from "./prompts";
import { decideRoute, routeInputFromConfig } from "./routing";
import {
  connectionsFirebaseSchema,
  connectionsZodSchema,
  parseStructuredOutput,
  photoFirebaseSchema,
  photoZodSchema,
  sensitivityFirebaseSchema,
  sensitivityZodSchema,
  summaryFirebaseSchema,
  summaryZodSchema,
  type ConnectionsResult,
  type PhotoResult,
  type SensitivityResult,
  type SummaryResult,
} from "./schemas";

export interface LedgerRecordInput {
  action: ActionId;
  requestedMode: InferenceModeValue;
  inferenceSource: InferenceSourceValue;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
  paperId: string | null;
}

export interface AiRuntime {
  ai: AI;
  config: RemoteConfigValues;
  strictMode: boolean;
  online: boolean;
  deviceAvailable: boolean;
  recordLedger: (entry: LedgerRecordInput) => Promise<void>;
  modelCreator?: ModelCreator;
}

export interface ImageInput {
  base64: string;
  mimeType: "image/jpeg" | "image/png";
}

export interface ActionRequest {
  action: ActionId;
  paper: Paper | null;
  papers?: Paper[];
  question?: string;
  image?: ImageInput;
  consentGiven: boolean;
  onStreamChunk?: (chunkText: string) => void;
}

export type ActionResult =
  | { action: "seal_scan"; data: SensitivityResult; source: InferenceSourceValue; durationMs: number; ledgerRecorded: boolean }
  | { action: "summarize"; data: SummaryResult; source: InferenceSourceValue; durationMs: number; ledgerRecorded: boolean }
  | { action: "ask"; data: { answer: string }; source: InferenceSourceValue; durationMs: number; ledgerRecorded: boolean }
  | { action: "photo_read"; data: PhotoResult; source: InferenceSourceValue; durationMs: number; ledgerRecorded: boolean }
  | { action: "connect_dots"; data: ConnectionsResult; source: InferenceSourceValue; durationMs: number; ledgerRecorded: boolean };

async function recordLedgerBestEffort(
  runtime: AiRuntime,
  entry: LedgerRecordInput,
): Promise<boolean> {
  try {
    await runtime.recordLedger(entry);
    return true;
  } catch (error) {
    logWarn("ledger_write_failed", {
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function requirePaper(request: ActionRequest): Paper {
  if (request.paper === null) {
    throw new AppError("validation", "This action needs a paper to work on.", "Open a paper first, then run the action.");
  }
  return request.paper;
}

export async function runAiAction(runtime: AiRuntime, request: ActionRequest): Promise<ActionResult> {
  const startedAt = performance.now();
  const creator = runtime.modelCreator ?? defaultModelCreator;
  void resolvePromptVersion(runtime.config.promptVersion);

  if (request.action === "connect_dots" && !request.consentGiven) {
    throw new AppError(
      "validation",
      "Connect the dots needs your explicit consent, because paper content leaves this device.",
      "Confirm in the consent dialog to continue.",
    );
  }

  const decision = decideRoute(
    routeInputFromConfig(request.action, runtime.config, runtime.strictMode, runtime.online, runtime.deviceAvailable),
  );
  if (decision.blocked) {
    throw new AppError("device_model", decision.reason, decision.nextStep);
  }
  const mode = decision.mode;

  const recordFailure = async (error: unknown): Promise<boolean> => {
    const appError = toAppError(error, "AI action failed");
    return recordLedgerBestEffort(runtime, {
      action: request.action,
      requestedMode: mode,
      inferenceSource: "none",
      durationMs: Math.round(performance.now() - startedAt),
      ok: false,
      errorCode: appError.code ?? appError.kind,
      paperId: request.paper?.id ?? null,
    });
  };

  try {
    const result = await executeAction(runtime, request, mode, creator, startedAt);
    return result;
  } catch (error) {
    await recordFailure(error);
    throw toAppError(error, "AI action failed");
  }
}

async function executeAction(
  runtime: AiRuntime,
  request: ActionRequest,
  mode: InferenceModeValue,
  creator: ModelCreator,
  startedAt: number,
): Promise<ActionResult> {
  const cloudModel = runtime.config.cloudModel;

  const finish = async <T extends ActionResult>(
    partial: Omit<T, "durationMs" | "ledgerRecorded"> & { source: InferenceSourceValue },
  ): Promise<T> => {
    const durationMs = Math.round(performance.now() - startedAt);
    const ledgerRecorded = await recordLedgerBestEffort(runtime, {
      action: request.action,
      requestedMode: mode,
      inferenceSource: partial.source,
      durationMs,
      ok: true,
      errorCode: null,
      paperId: request.paper?.id ?? null,
    });
    logInfo("ai_action_succeeded", {
      action: request.action,
      mode,
      source: partial.source,
      durationMs,
      ledgerRecorded,
    });
    return { ...partial, durationMs, ledgerRecorded } as T;
  };

  switch (request.action) {
    case "seal_scan": {
      const paper = requirePaper(request);
      const model = createHybridModel(
        runtime.ai,
        { mode, cloudModel, schema: sensitivityFirebaseSchema },
        creator,
      );
      const { text, source } = await generateText(model, buildSensitivityPrompt(paper.body));
      const data = parseStructuredOutput(text, sensitivityZodSchema);
      return finish({ action: "seal_scan", data, source });
    }
    case "summarize": {
      const paper = requirePaper(request);
      const model = createHybridModel(
        runtime.ai,
        { mode, cloudModel, schema: summaryFirebaseSchema },
        creator,
      );
      const { text, source } = await generateText(model, buildSummaryPrompt(paper.body));
      const data = parseStructuredOutput(text, summaryZodSchema);
      return finish({ action: "summarize", data, source });
    }
    case "ask": {
      const paper = requirePaper(request);
      const question = (request.question ?? "").trim();
      if (question === "") {
        throw new AppError("validation", "Type a question first.", "Questions are answered from the open paper only.");
      }
      const model = createHybridModel(runtime.ai, { mode, cloudModel }, creator);
      const streamResult = await model.generateContentStream(buildAskPrompt(paper.body, question));
      let answer = "";
      for await (const chunk of streamResult.stream) {
        const piece = chunk.text();
        answer += piece;
        request.onStreamChunk?.(piece);
      }
      const finalResponse = await streamResult.response;
      const source = readInferenceSource(finalResponse);
      if (answer.trim() === "") {
        throw new AppError(
          "model_output",
          "The model returned an empty answer, so nothing was saved.",
          "Try rephrasing the question.",
        );
      }
      return finish({ action: "ask", data: { answer }, source });
    }
    case "photo_read": {
      if (request.image === undefined) {
        throw new AppError("validation", "Attach a photo first.", "Photo read needs a JPEG or PNG image.");
      }
      const model = createHybridModel(
        runtime.ai,
        { mode, cloudModel, schema: photoFirebaseSchema, multimodal: true },
        creator,
      );
      const imagePart: Part = {
        type: "inlineData",
        inlineData: { data: request.image.base64, mimeType: request.image.mimeType },
      };
      const { text, source } = await generateText(model, [buildPhotoPrompt(), imagePart]);
      const data = parseStructuredOutput(text, photoZodSchema);
      return finish({ action: "photo_read", data, source });
    }
    case "connect_dots": {
      const papers = request.papers ?? [];
      if (papers.length < 2) {
        throw new AppError(
          "validation",
          "Connect the dots needs at least two papers.",
          "Select two or more papers, then run the analysis.",
        );
      }
      const model = createHybridModel(
        runtime.ai,
        { mode, cloudModel, schema: connectionsFirebaseSchema },
        creator,
      );
      const { text, source } = await generateText(model, buildConnectionsPrompt(papers));
      const data = parseStructuredOutput(text, connectionsZodSchema);
      return finish({ action: "connect_dots", data, source });
    }
  }
}

async function generateText(
  model: GenerativeModel,
  request: string | Array<string | Part>,
): Promise<{ text: string; source: InferenceSourceValue }> {
  let result;
  try {
    result = await model.generateContent(request);
  } catch (error) {
    logError("ai_generate_failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  const source = readInferenceSource(result.response);
  const text = requireResponseText(result.response, "The model returned no usable text");
  return { text, source };
}
