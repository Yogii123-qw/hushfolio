import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import type { AppContext } from "../appContext";
import { EmptyState, ErrorPanel, InlineNotice, SourcePill } from "../components/feedback";
import { listLedgerPage } from "../data/ledger";
import { toAppError, type AppError } from "../errors";
import { ACTION_LABELS, type LedgerEntry } from "../types";
import { formatDateTime, formatDuration } from "../utils";

export function LedgerView({ ctx }: { ctx: AppContext }): JSX.Element {
  const { services, user, config } = ctx;
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [skippedMalformed, setSkippedMalformed] = useState(0);

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
      const page = await listLedgerPage(services.db, user.uid, config.pageSize, null);
      if (!mountedRef.current) return;
      setEntries(page.entries);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setSkippedMalformed(page.skippedMalformed);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(toAppError(loadError, "Loading the ledger failed"));
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
      const page = await listLedgerPage(services.db, user.uid, config.pageSize, cursor);
      if (!mountedRef.current) return;
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setSkippedMalformed((prev) => prev + page.skippedMalformed);
    } catch (loadError) {
      if (mountedRef.current) setError(toAppError(loadError, "Loading more ledger entries failed"));
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1>Ledger</h1>
        <p>
          A permanent record of every AI run: what ran, what was requested, where it actually ran,
          and whether it worked. The ledger never contains paper text, questions, photos, or model
          output — metadata only.
        </p>
      </div>

      {skippedMalformed > 0 ? (
        <InlineNotice
          tone="warn"
          text={`${skippedMalformed} stored ${skippedMalformed === 1 ? "entry" : "entries"} could not be read and were skipped.`}
        />
      ) : null}
      {error !== null ? <ErrorPanel error={error} onRetry={() => void loadFirstPage()} retryLabel="Reload ledger" /> : null}

      {loading ? (
        <p style={{ marginTop: 24 }}>Loading the ledger…</p>
      ) : entries.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState
            title="No runs recorded yet"
            body="Run Seal Scan, a summary, a question, or a photo reading from an open paper, and the run will be recorded here with where it actually ran."
            actionLabel="Open your papers"
            onAction={() => ctx.onNavigate("papers")}
          />
        </div>
      ) : (
        <div className="ledger-list" style={{ marginTop: 24 }}>
          {entries.map((entry) => (
            <div className="ledger-row" key={entry.id}>
              <div>
                <p className="ledger-row-action">{ACTION_LABELS[entry.action]}</p>
                <p className="ledger-row-meta">
                  Requested: {entry.requestedMode.replaceAll("_", " ")}.{" "}
                  {formatDateTime(entry.createdAt)}. Took {formatDuration(entry.durationMs)}.
                  {entry.errorCode !== null ? ` Error: ${entry.errorCode}.` : ""}
                </p>
              </div>
              <SourcePill source={entry.inferenceSource} />
            </div>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="load-more-row">
          <button type="button" className="button button-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more entries"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
