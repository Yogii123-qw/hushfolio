import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { runAiAction, type AiRuntime } from "../ai/actions";
import { modeExplanation } from "../ai/routing";
import type { ConnectionsResult } from "../ai/schemas";
import type { AppContext } from "../appContext";
import { ErrorPanel, EmptyState, InlineNotice, SealBadge, SourcePill } from "../components/feedback";
import { Modal } from "../components/Modal";
import { LinkIcon } from "../components/icons";
import { fetchPapersForSearch, createPaper, listPapersPage } from "../data/papers";
import { collectTags, filterPapersByTag, searchPapers } from "../data/search";
import { splitTagField, validatePaperInput } from "../data/validation";
import { AppError, toAppError } from "../errors";
import type { Paper } from "../types";
import { formatDateTime, formatDuration } from "../utils";

const CONNECT_MAX_PAPERS = 8;

/** A compose draft lives in App so navigating away never loses typed text. */
export interface ComposeDraft {
  title: string;
  body: string;
  tagField: string;
}

export const EMPTY_DRAFT: ComposeDraft = { title: "", body: "", tagField: "" };

interface PapersViewProps {
  ctx: AppContext;
  composing: boolean;
  onComposingChange: (value: boolean) => void;
  draft: ComposeDraft;
  onDraftChange: (draft: ComposeDraft) => void;
  onOpenPaper: (paperId: string) => void;
}

export function PapersView({ ctx, composing, onComposingChange, draft, onDraftChange, onOpenPaper }: PapersViewProps): JSX.Element {
  const { services, user, config } = ctx;
  const [papers, setPapers] = useState<Paper[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [skippedMalformed, setSkippedMalformed] = useState(0);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Paper[] | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const [formIssues, setFormIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [consentOpen, setConsentOpen] = useState(false);
  const [connectRunning, setConnectRunning] = useState(false);
  const [connectResult, setConnectResult] = useState<{
    data: ConnectionsResult;
    source: "on_device" | "in_cloud" | "none";
    durationMs: number;
    ledgerRecorded: boolean;
  } | null>(null);
  const [connectError, setConnectError] = useState<AppError | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listPapersPage(services.db, user.uid, config.pageSize, null);
      if (!mountedRef.current) return;
      setPapers(page.papers);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setSkippedMalformed(page.skippedMalformed);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(toAppError(loadError, "Loading papers failed"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [services.db, user.uid, config.pageSize]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listPapersPage(services.db, user.uid, config.pageSize, cursor);
      if (!mountedRef.current) return;
      setPapers((prev) => [...prev, ...page.papers]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setSkippedMalformed((prev) => prev + page.skippedMalformed);
    } catch (loadError) {
      if (mountedRef.current) setError(toAppError(loadError, "Loading more papers failed"));
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      setSearchResults(null);
      setSearchTruncated(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const fetched = await fetchPapersForSearch(services.db, user.uid);
          if (!mountedRef.current) return;
          setSearchResults(searchPapers(fetched.papers, trimmed));
          setSearchTruncated(fetched.truncated);
        } catch (searchError) {
          if (mountedRef.current) setError(toAppError(searchError, "Searching papers failed"));
        } finally {
          if (mountedRef.current) setSearching(false);
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [query, services.db, user.uid]);

  const displayed = tagFilter === null ? (searchResults ?? papers) : filterPapersByTag(searchResults ?? papers, tagFilter);
  const allTags = collectTags(papers);

  const submitCompose = async (): Promise<void> => {
    const validated = validatePaperInput(
      { title: draft.title, body: draft.body, tags: splitTagField(draft.tagField) },
      config.maxPaperChars,
    );
    if (!validated.ok) {
      setFormIssues(validated.issues);
      return;
    }
    setFormIssues([]);
    setSaving(true);
    try {
      const id = await createPaper(services.db, user.uid, validated.value, config.maxPaperChars);
      onDraftChange(EMPTY_DRAFT);
      onComposingChange(false);
      onOpenPaper(id);
    } catch (saveError) {
      setFormIssues([toAppError(saveError, "Saving the paper failed").message]);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (paperId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else if (next.size < CONNECT_MAX_PAPERS) {
        next.add(paperId);
      }
      return next;
    });
  };

  const runConnectDots = async (): Promise<void> => {
    const selected = papers.filter((paper) => selectedIds.has(paper.id));
    if (selected.length < 2) return;
    setConnectRunning(true);
    setConnectError(null);
    setConnectResult(null);
    const runtime: AiRuntime = {
      ai: services.ai,
      config,
      strictMode: ctx.strictMode,
      online: ctx.online,
      deviceAvailable: ctx.deviceProbe.status === "available",
      recordLedger: ctx.recordLedger,
    };
    try {
      const result = await runAiAction(runtime, {
        action: "connect_dots",
        paper: null,
        papers: selected,
        consentGiven: true,
      });
      if (result.action !== "connect_dots") return;
      setConnectResult({
        data: result.data,
        source: result.source,
        durationMs: result.durationMs,
        ledgerRecorded: result.ledgerRecorded,
      });
    } catch (actionError) {
      setConnectError(toAppError(actionError, "Connect the dots failed"));
    } finally {
      setConnectRunning(false);
    }
  };

  if (composing) {
    return (
      <div>
        <div className="view-head">
          <h1>New paper</h1>
          <p>Write or paste the paper. It is saved to your archive only when you file it.</p>
        </div>
        <form
          className="compose-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCompose();
          }}
        >
          <div className="field">
            <label htmlFor="paper-title">Title</label>
            <input
              id="paper-title"
              className="text-input"
              value={draft.title}
              onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="paper-body">Paper</label>
            <textarea
              id="paper-body"
              className="text-area"
              value={draft.body}
              onChange={(event) => onDraftChange({ ...draft, body: event.target.value })}
              placeholder="Paste a journal entry, a letter draft, meeting notes…"
            />
            <p className={draft.body.length > config.maxPaperChars ? "char-count char-count-over" : "char-count"}>
              {draft.body.length.toLocaleString()} / {config.maxPaperChars.toLocaleString()} characters
            </p>
          </div>
          <div className="field">
            <label htmlFor="paper-tags">Tags (comma-separated, optional)</label>
            <input
              id="paper-tags"
              className="text-input"
              value={draft.tagField}
              onChange={(event) => onDraftChange({ ...draft, tagField: event.target.value })}
              placeholder="journal, family, work"
            />
            <p className="field-hint">At most 12 tags. Tags are lowercased and cleaned up automatically.</p>
          </div>
          {formIssues.length > 0 ? (
            <div className="error-panel" role="alert">
              {formIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Filing…" : "File this paper"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onComposingChange(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head">
        <h1>Papers</h1>
        <p>Your private archive. Papers live under your account; AI actions run from the open paper.</p>
      </div>

      <div className="search-row">
        <input
          className="text-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, tags, and text…"
          aria-label="Search papers"
        />
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setSelecting((prev) => !prev);
            setSelectedIds(new Set());
          }}
          aria-pressed={selecting}
        >
          <LinkIcon size={18} /> {selecting ? "Done selecting" : "Connect papers"}
        </button>
      </div>
      {searching ? <InlineNotice text="Searching…" /> : null}
      {searchTruncated ? (
        <InlineNotice
          tone="warn"
          text="Search covered the 200 most recently updated papers only. Older papers were not searched."
        />
      ) : null}
      {skippedMalformed > 0 ? (
        <InlineNotice
          tone="warn"
          text={`${skippedMalformed} stored ${skippedMalformed === 1 ? "document" : "documents"} could not be read and were skipped.`}
        />
      ) : null}

      {allTags.length > 0 ? (
        <div className="tag-row" aria-label="Filter by tag">
          <button
            type="button"
            className={tagFilter === null ? "tag-chip tag-chip-active" : "tag-chip"}
            onClick={() => setTagFilter(null)}
          >
            All tags
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={tagFilter === tag ? "tag-chip tag-chip-active" : "tag-chip"}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              aria-pressed={tagFilter === tag}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      {error !== null ? <ErrorPanel error={error} onRetry={() => void loadFirstPage()} retryLabel="Reload papers" /> : null}

      {loading ? (
        <p style={{ marginTop: 24 }}>Loading your papers…</p>
      ) : displayed.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          {query.trim() === "" && tagFilter === null ? (
            <EmptyState
              title="No papers yet"
              body="File your first paper to start the archive. Seal Scan and summaries run from the open paper."
              actionLabel="Write the first paper"
              onAction={() => onComposingChange(true)}
            />
          ) : (
            <EmptyState
              title="No papers match"
              body="Try a different search or clear the tag filter."
            />
          )}
        </div>
      ) : (
        <div className="paper-index" style={{ marginTop: 24 }}>
          {displayed.map((paper) => (
            <div key={paper.id} style={{ display: "flex", alignItems: "stretch" }}>
              {selecting ? (
                <label className="select-row" style={{ paddingLeft: 16 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(paper.id)}
                    onChange={() => toggleSelect(paper.id)}
                    aria-label={`Select ${paper.title}`}
                    disabled={!selectedIds.has(paper.id) && selectedIds.size >= CONNECT_MAX_PAPERS}
                  />
                </label>
              ) : null}
              <button type="button" className="paper-row" onClick={() => onOpenPaper(paper.id)} style={{ flex: 1 }}>
                <span>
                  <span className="paper-row-title">{paper.title}</span>
                  <span className="paper-row-meta" style={{ display: "block" }}>
                    Updated {formatDateTime(paper.updatedAt)}
                    {paper.tags.length > 0 ? ` — filed under ${paper.tags.join(", ")}` : ""}
                  </span>
                  {paper.summary !== null ? <span className="paper-row-snippet">{paper.summary}</span> : null}
                </span>
                <span className="paper-row-side">
                  {paper.sensitivity !== null && paper.sensitivity.scannedOnDevice ? (
                    <SealBadge label="Sealed" />
                  ) : null}
                  <span className="tag-static">{paper.mood}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {hasMore && searchResults === null ? (
        <div className="load-more-row">
          <button type="button" className="button button-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more papers"}
          </button>
        </div>
      ) : null}

      {selecting ? (
        <section className="connect-panel" aria-label="Connect the dots">
          <h2 className="section-title">Connect the dots</h2>
          {ctx.strictMode ? (
            <p>
              Strict mode is on, so this cloud-backed analysis is disabled. Turn Strict mode off in
              Settings to use it, or keep working on-device.
            </p>
          ) : !config.cloudEnabled ? (
            <p>Cloud-backed analysis is currently disabled for this app.</p>
          ) : (
            <>
              <p>
                Find themes, connections, and a timeline across {selectedIds.size} selected{" "}
                {selectedIds.size === 1 ? "paper" : "papers"} (2 to {CONNECT_MAX_PAPERS}).{" "}
                {modeExplanation("prefer_in_cloud")}
              </p>
              <div className="ai-action-controls">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={selectedIds.size < 2 || connectRunning}
                  onClick={() => setConsentOpen(true)}
                >
                  {connectRunning ? "Analyzing…" : `Analyze ${selectedIds.size} papers`}
                </button>
              </div>
            </>
          )}
          {connectError !== null ? <ErrorPanel error={connectError} /> : null}
          {connectResult !== null ? (
            <div className="ai-result">
              <div className="ai-result-head">
                <SourcePill source={connectResult.source} />
                <span>Took {formatDuration(connectResult.durationMs)}</span>
                <span>{connectResult.ledgerRecorded ? "Recorded in the ledger." : "Ledger recording failed; the result above still stands."}</span>
              </div>
              <h4>Themes</h4>
              <ul>
                {connectResult.data.themes.map((theme) => (
                  <li key={theme}>{theme}</li>
                ))}
              </ul>
              <h4>Connections</h4>
              {connectResult.data.connections.length === 0 ? (
                <p>No connections were found between the selected papers.</p>
              ) : (
                <ul>
                  {connectResult.data.connections.map((connection, index) => (
                    <li key={`${connection.firstPaper}-${connection.secondPaper}-${index}`}>
                      <strong>{connection.firstPaper}</strong> and <strong>{connection.secondPaper}</strong>:{" "}
                      {connection.relation}
                    </li>
                  ))}
                </ul>
              )}
              <h4>Timeline</h4>
              {connectResult.data.timeline.length === 0 ? (
                <p>No dated references were found in the selected papers.</p>
              ) : (
                <ul>
                  {connectResult.data.timeline.map((entry, index) => (
                    <li key={`${entry.label}-${index}`}>
                      <strong>{entry.label}</strong>: {entry.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {consentOpen ? (
        <Modal
          title="Send papers to the cloud model?"
          onClose={() => setConsentOpen(false)}
          footer={
            <>
              <button type="button" className="button button-secondary" onClick={() => setConsentOpen(false)}>
                Keep them private
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setConsentOpen(false);
                  void runConnectDots();
                }}
              >
                Yes, analyze in the cloud
              </button>
            </>
          }
        >
          {ctx.online ? (
            <p>
              The full text of the {selectedIds.size} selected papers will be sent to the cloud model (
              {config.cloudModel}) for this one analysis. The papers themselves stay in your archive;
              only this analysis request leaves the device.
            </p>
          ) : (
            <p>
              You are offline, so this analysis will attempt the on-device model instead of the cloud
              model. If the on-device model is not ready, the analysis will fail rather than wait for a
              connection.
            </p>
          )}
          <p>
            The result is labeled with where it actually ran, and the run is recorded in the ledger
            with metadata only.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
