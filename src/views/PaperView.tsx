import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { runAiAction, type AiRuntime } from "../ai/actions";
import { decideRoute, modeExplanation, routeInputFromConfig } from "../ai/routing";
import type { PhotoResult, SensitivityResult, SummaryResult } from "../ai/schemas";
import type { AppContext } from "../appContext";
import { ErrorPanel, InlineNotice, SealBadge, SourcePill } from "../components/feedback";
import { ConfirmDialog } from "../components/Modal";
import { deletePaper, getPaper, updatePaper } from "../data/papers";
import { splitTagField, validatePaperInput } from "../data/validation";
import { AppError, toAppError } from "../errors";
import type { ActionId, InferenceSourceValue, Paper } from "../types";
import { formatDateTime, formatDuration, photoFileToData, type PhotoFileData } from "../utils";

interface PaperViewProps {
  ctx: AppContext;
  paperId: string;
  onBack: () => void;
  onDeleted: () => void;
}

interface RunMeta {
  source: InferenceSourceValue;
  durationMs: number;
  ledgerRecorded: boolean;
}

export function PaperView({ ctx, paperId, onBack, onDeleted }: PaperViewProps): JSX.Element {
  const { services, user, config } = ctx;
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editIssues, setEditIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [runningAction, setRunningAction] = useState<ActionId | null>(null);
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [sealResult, setSealResult] = useState<{ data: SensitivityResult; meta: RunMeta } | null>(null);
  const [summaryResult, setSummaryResult] = useState<{ data: SummaryResult; meta: RunMeta } | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askMeta, setAskMeta] = useState<RunMeta | null>(null);
  const [photoFile, setPhotoFile] = useState<PhotoFileData | null>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<{ data: PhotoResult; meta: RunMeta } | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPaper = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await getPaper(services.db, user.uid, paperId);
      if (!mountedRef.current) return;
      if (loaded === null) {
        setError(
          new AppError(
            "unknown",
            "This paper could not be found. It may have been deleted.",
            "Go back to the paper list.",
          ),
        );
        setPaper(null);
      } else {
        setPaper(loaded);
      }
    } catch (loadError) {
      if (mountedRef.current) setError(toAppError(loadError, "Opening the paper failed"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [services.db, user.uid, paperId]);

  useEffect(() => {
    void loadPaper();
  }, [loadPaper]);

  const runtime: AiRuntime = {
    ai: services.ai,
    config,
    strictMode: ctx.strictMode,
    online: ctx.online,
    deviceAvailable: ctx.deviceProbe.status === "available",
    recordLedger: ctx.recordLedger,
  };

  const startEdit = (): void => {
    if (paper === null) return;
    setEditTitle(paper.title);
    setEditBody(paper.body);
    setEditTags(paper.tags.join(", "));
    setEditIssues([]);
    setEditing(true);
  };

  const saveEdit = async (): Promise<void> => {
    if (paper === null) return;
    const validated = validatePaperInput(
      { title: editTitle, body: editBody, tags: splitTagField(editTags) },
      config.maxPaperChars,
    );
    if (!validated.ok) {
      setEditIssues(validated.issues);
      return;
    }
    setEditIssues([]);
    setSaving(true);
    try {
      await updatePaper(
        services.db,
        user.uid,
        paper.id,
        { title: validated.value.title, body: validated.value.body, tags: validated.value.tags },
        config.maxPaperChars,
      );
      setEditing(false);
      await loadPaper();
    } catch (saveError) {
      setEditIssues([toAppError(saveError, "Saving the paper failed").message]);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (paper === null) return;
    try {
      await deletePaper(services.db, user.uid, paper.id);
      onDeleted();
    } catch (deleteError) {
      setError(toAppError(deleteError, "Deleting the paper failed"));
      setConfirmDelete(false);
    }
  };

  const runAction = async (action: ActionId, extra: { question?: string; image?: PhotoFileData } = {}): Promise<void> => {
    if (paper === null || runningAction !== null) return;
    setRunningAction(action);
    setActionError(null);
    setSaveNote(null);
    if (action === "ask") {
      setAnswer("");
      setAskMeta(null);
    }
    try {
      const result = await runAiAction(runtime, {
        action,
        paper,
        ...(extra.question !== undefined ? { question: extra.question } : {}),
        ...(extra.image !== undefined
          ? { image: { base64: extra.image.base64, mimeType: extra.image.mimeType } }
          : {}),
        consentGiven: false,
        onStreamChunk: (chunk) => {
          setAnswer((prev) => prev + chunk);
        },
      });
      const meta: RunMeta = {
        source: result.source,
        durationMs: result.durationMs,
        ledgerRecorded: result.ledgerRecorded,
      };
      if (result.action === "seal_scan") setSealResult({ data: result.data, meta });
      if (result.action === "summarize") setSummaryResult({ data: result.data, meta });
      if (result.action === "ask") setAskMeta(meta);
      if (result.action === "photo_read") setPhotoResult({ data: result.data, meta });
    } catch (actionErrorValue) {
      setActionError(toAppError(actionErrorValue, "The AI action failed"));
    } finally {
      setRunningAction(null);
    }
  };

  const applySummary = async (): Promise<void> => {
    if (paper === null || summaryResult === null) return;
    try {
      await updatePaper(
        services.db,
        user.uid,
        paper.id,
        {
          title: summaryResult.data.title,
          summary: summaryResult.data.summary,
          tags: summaryResult.data.tags,
          mood: summaryResult.data.mood,
        },
        config.maxPaperChars,
      );
      setSaveNote("Summary, title, tags, and mood saved to the paper.");
      await loadPaper();
    } catch (saveError) {
      setActionError(toAppError(saveError, "Saving the summary failed"));
    }
  };

  const saveSensitivity = async (): Promise<void> => {
    if (paper === null || sealResult === null) return;
    try {
      await updatePaper(
        services.db,
        user.uid,
        paper.id,
        {
          sensitivity: {
            level: sealResult.data.level,
            categories: [...sealResult.data.categories],
            notes: sealResult.data.notes,
            redactedPreview: sealResult.data.redactedPreview,
            scannedAt: Date.now(),
            scannedOnDevice: sealResult.meta.source === "on_device",
          },
        },
        config.maxPaperChars,
      );
      setSaveNote("Seal Scan result saved to the paper.");
      await loadPaper();
    } catch (saveError) {
      setActionError(toAppError(saveError, "Saving the scan result failed"));
    }
  };

  const savePhotoOutcome = async (): Promise<void> => {
    if (paper === null || photoResult === null || photoFile === null) return;
    const appendedBody = `${paper.body}\n\n[Photo transcription — ${photoFile.name}]\n${photoResult.data.transcription}`;
    try {
      await updatePaper(
        services.db,
        user.uid,
        paper.id,
        {
          body: appendedBody,
          photo: {
            name: photoFile.name,
            mimeType: photoFile.mimeType,
            width: photoFile.width,
            height: photoFile.height,
            readAt: Date.now(),
          },
        },
        config.maxPaperChars,
      );
      setSaveNote("Transcription appended and photo details saved. The photo itself was not uploaded.");
      setPhotoFile(null);
      await loadPaper();
    } catch (saveError) {
      setActionError(toAppError(saveError, "Saving the photo result failed"));
    }
  };

  const onPickPhoto = async (file: File | undefined): Promise<void> => {
    setPhotoProblem(null);
    setPhotoResult(null);
    if (file === undefined) {
      setPhotoFile(null);
      return;
    }
    const parsed = await photoFileToData(file);
    if (!parsed.ok) {
      setPhotoFile(null);
      setPhotoProblem(parsed.reason);
      return;
    }
    setPhotoFile(parsed.data);
  };

  if (loading) {
    return (
      <div>
        <p>Opening the paper…</p>
      </div>
    );
  }

  if (paper === null) {
    return (
      <div>
        {error !== null ? <ErrorPanel error={error} onRetry={onBack} retryLabel="Back to papers" /> : null}
      </div>
    );
  }

  const photoRoute = decideRoute(routeInputFromConfig("photo_read", config, ctx.strictMode, ctx.online, ctx.deviceProbe.status === "available"));
  const busy = runningAction !== null;

  return (
    <div>
      <button type="button" className="button button-quiet" onClick={onBack}>
        Back to papers
      </button>

      <article className="sheet">
        <div className="sheet-inner">
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              <div className="field">
                <label htmlFor="edit-title">Title</label>
                <input
                  id="edit-title"
                  className="text-input"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="edit-body">Paper</label>
                <textarea
                  id="edit-body"
                  className="text-area"
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                />
                <p className={editBody.length > config.maxPaperChars ? "char-count char-count-over" : "char-count"}>
                  {editBody.length.toLocaleString()} / {config.maxPaperChars.toLocaleString()} characters
                </p>
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="edit-tags">Tags (comma-separated)</label>
                <input
                  id="edit-tags"
                  className="text-input"
                  value={editTags}
                  onChange={(event) => setEditTags(event.target.value)}
                />
              </div>
              {editIssues.length > 0 ? (
                <div className="error-panel" role="alert">
                  {editIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              ) : null}
              <div className="sheet-actions">
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="button button-secondary" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1>{paper.title}</h1>
              <p className="sheet-meta">
                Filed {formatDateTime(paper.createdAt)}. Updated {formatDateTime(paper.updatedAt)}.
                {paper.tags.length > 0 ? ` Filed under ${paper.tags.join(", ")}.` : ""}
                {paper.mood !== "unknown" ? ` Mood: ${paper.mood}.` : ""}
              </p>
              {paper.sensitivity !== null ? (
                <p className="sheet-meta">
                  <SealBadge label="Sealed" /> Sensitivity {paper.sensitivity.level}. Scanned{" "}
                  {formatDateTime(paper.sensitivity.scannedAt)}
                  {paper.sensitivity.scannedOnDevice ? " on this device" : ""}. Categories:{" "}
                  {paper.sensitivity.categories.length > 0 ? paper.sensitivity.categories.join(", ") : "none"}.
                </p>
              ) : null}
              {paper.photo !== null ? (
                <p className="sheet-meta">
                  Photo read: {paper.photo.name} ({paper.photo.width}×{paper.photo.height}),{" "}
                  {formatDateTime(paper.photo.readAt)}. The photo itself was never uploaded.
                </p>
              ) : null}
              <div className="sheet-body">{paper.body}</div>
              <div className="sheet-actions">
                <button type="button" className="button button-secondary" onClick={startEdit}>
                  Edit paper
                </button>
                <button type="button" className="button button-danger" onClick={() => setConfirmDelete(true)}>
                  Delete paper
                </button>
              </div>
            </>
          )}
        </div>
      </article>

      {saveNote !== null ? <InlineNotice text={saveNote} /> : null}
      {actionError !== null ? <ErrorPanel error={actionError} /> : null}

      <section className="ai-panel" aria-label="AI actions">
        <h2 className="section-title">Sealed workbench</h2>
        <p style={{ color: "var(--slate)", fontSize: 14, maxWidth: "62ch" }}>
          Each action shows exactly where it ran. Seal Scan never leaves this device. Summaries and
          questions prefer this device and only use the cloud when the model is not ready here.
        </p>

        <div className="ai-action">
          <div className="ai-action-head">
            <h3>Seal Scan</h3>
            <SourcePill source={sealResult !== null ? sealResult.meta.source : "none"} />
          </div>
          <p className="ai-action-desc">
            {modeExplanation("only_on_device")} It finds sensitive details and shows a redacted preview
            with the values replaced, never copied.
          </p>
          <div className="ai-action-controls">
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => void runAction("seal_scan")}
            >
              {runningAction === "seal_scan" ? "Scanning…" : "Scan this paper"}
            </button>
          </div>
          {sealResult !== null ? (
            <div className="ai-result">
              <div className="ai-result-head">
                <span>Took {formatDuration(sealResult.meta.durationMs)}</span>
                <span>
                  {sealResult.meta.ledgerRecorded
                    ? "Recorded in the ledger."
                    : "Ledger recording failed; the result above still stands."}
                </span>
              </div>
              <dl>
                <dt>Level</dt>
                <dd>{sealResult.data.level}</dd>
                <dt>Categories</dt>
                <dd>{sealResult.data.categories.length > 0 ? sealResult.data.categories.join(", ") : "None found"}</dd>
              </dl>
              <h4>Why</h4>
              <p>{sealResult.data.notes}</p>
              <h4>Redacted preview</h4>
              <p className="redacted-text">{sealResult.data.redactedPreview}</p>
              <div className="ai-action-controls">
                <button type="button" className="button button-secondary" onClick={() => void saveSensitivity()}>
                  Save scan to the paper
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ai-action">
          <div className="ai-action-head">
            <h3>Summarize and file</h3>
            <SourcePill source={summaryResult !== null ? summaryResult.meta.source : "none"} />
          </div>
          <p className="ai-action-desc">
            {modeExplanation("prefer_on_device")} A title, a short summary, tags, and a mood — saved
            only when you approve.
          </p>
          <div className="ai-action-controls">
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => void runAction("summarize")}
            >
              {runningAction === "summarize" ? "Summarizing…" : "Summarize this paper"}
            </button>
          </div>
          {summaryResult !== null ? (
            <div className="ai-result">
              <div className="ai-result-head">
                <span>Took {formatDuration(summaryResult.meta.durationMs)}</span>
                <span>
                  {summaryResult.meta.ledgerRecorded
                    ? "Recorded in the ledger."
                    : "Ledger recording failed; the result above still stands."}
                </span>
              </div>
              <dl>
                <dt>Title</dt>
                <dd>{summaryResult.data.title}</dd>
                <dt>Summary</dt>
                <dd>{summaryResult.data.summary}</dd>
                <dt>Tags</dt>
                <dd>{summaryResult.data.tags.length > 0 ? summaryResult.data.tags.join(", ") : "None"}</dd>
                <dt>Mood</dt>
                <dd>{summaryResult.data.mood}</dd>
              </dl>
              <div className="ai-action-controls">
                <button type="button" className="button button-secondary" onClick={() => void applySummary()}>
                  Apply to the paper
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ai-action">
          <div className="ai-action-head">
            <h3>Ask this paper</h3>
            <SourcePill source={askMeta !== null ? askMeta.source : "none"} />
          </div>
          <p className="ai-action-desc">
            {modeExplanation("prefer_on_device")} The answer is drawn only from this paper, and it
            streams in as it is written. Each question is a fresh, single question — there is no
            conversation memory.
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="ask-question">Your question</label>
            <input
              id="ask-question"
              className="text-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What did I decide about the trip?"
              maxLength={500}
            />
          </div>
          <div className="ai-action-controls">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || question.trim() === ""}
              onClick={() => void runAction("ask", { question: question.trim() })}
            >
              {runningAction === "ask" ? "Answering…" : "Ask"}
            </button>
          </div>
          {answer !== "" || askMeta !== null ? (
            <div className="ai-result">
              {askMeta !== null ? (
                <div className="ai-result-head">
                  <span>Took {formatDuration(askMeta.durationMs)}</span>
                  <span>
                    {askMeta.ledgerRecorded
                      ? "Recorded in the ledger."
                      : "Ledger recording failed; the answer above still stands."}
                  </span>
                </div>
              ) : null}
              <p className="stream-answer">{answer === "" ? "…" : answer}</p>
            </div>
          ) : null}
        </div>

        {config.photoEnabled ? (
          <div className="ai-action">
            <div className="ai-action-head">
              <h3>Read a photo of a paper</h3>
              <SourcePill source={photoResult !== null ? photoResult.meta.source : "none"} />
            </div>
            <p className="ai-action-desc">
              {modeExplanation("prefer_on_device")} JPEG or PNG, up to 8 MB. The photo stays in this
              browser tab: only the extracted text and the photo details are ever saved.
            </p>
            {!photoRoute.blocked && photoRoute.mode !== "only_on_device" && ctx.online ? (
              <InlineNotice
                tone="warn"
                text="If the on-device model is not ready, this photo would be sent to the cloud model for this one reading. Turn on Strict mode in Settings to keep every photo on this device."
              />
            ) : null}
            <div className="ai-action-controls">
              <label className="file-pick">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="file-pick-input"
                  aria-label="Choose a photo of a paper"
                  onChange={(event) => {
                    void onPickPhoto(event.target.files?.[0]);
                  }}
                />
                <span className="file-pick-button">Choose a photo</span>
                <span className="file-pick-name">{photoFile !== null ? photoFile.name : "No photo chosen"}</span>
              </label>
            </div>
            {photoProblem !== null ? <InlineNotice tone="warn" text={photoProblem} /> : null}
            {photoFile !== null ? (
              <p style={{ fontSize: 14, color: "var(--slate)", marginTop: 8 }}>
                {photoFile.width}×{photoFile.height}, {(photoFile.sizeBytes / 1024).toFixed(0)} KB. Held in
                this tab only, not uploaded.
              </p>
            ) : null}
            <div className="ai-action-controls">
              <button
                type="button"
                className="button button-primary"
                disabled={busy || photoFile === null}
                onClick={() => {
                  if (photoFile !== null) void runAction("photo_read", { image: photoFile });
                }}
              >
                {runningAction === "photo_read" ? "Reading…" : "Read the photo"}
              </button>
            </div>
            {photoResult !== null ? (
              <div className="ai-result">
                <div className="ai-result-head">
                  <span>Took {formatDuration(photoResult.meta.durationMs)}</span>
                  <span>
                    {photoResult.meta.ledgerRecorded
                      ? "Recorded in the ledger."
                      : "Ledger recording failed; the result above still stands."}
                  </span>
                </div>
                <dl>
                  <dt>Document type</dt>
                  <dd>{photoResult.data.docType}</dd>
                  <dt>Confidence</dt>
                  <dd>{photoResult.data.confidence}</dd>
                </dl>
                <h4>Description</h4>
                <p>{photoResult.data.description}</p>
                <h4>Transcription</h4>
                <p className="redacted-text">{photoResult.data.transcription}</p>
                <div className="ai-action-controls">
                  <button type="button" className="button button-secondary" onClick={() => void savePhotoOutcome()}>
                    Append transcription and save photo details
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this paper?"
          body="The paper and its summary, tags, and scan record will be permanently deleted. Ledger entries about AI runs on this paper are kept, because they contain no paper content."
          confirmLabel="Delete permanently"
          destructive
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}
