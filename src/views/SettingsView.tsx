import { useState, type JSX } from "react";
import type { AppContext } from "../appContext";
import { ErrorPanel, InlineNotice } from "../components/feedback";
import { ConfirmDialog } from "../components/Modal";
import { downloadTextFile, exportFilename, papersToJson, papersToMarkdown } from "../data/export";
import { fetchPapersForSearch, SEARCH_FETCH_CAP } from "../data/papers";
import { signInWithGoogleFlow, signOutFlow } from "../platform/auth";
import { toAppError, type AppError } from "../errors";
import { formatDateTime } from "../utils";

export function SettingsView({ ctx }: { ctx: AppContext }): JSX.Element {
  const { services, user, config } = ctx;
  const [exportBusy, setExportBusy] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exportError, setExportError] = useState<AppError | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<AppError | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = useState(false);

  const exportPapers = async (format: "json" | "markdown"): Promise<void> => {
    setExportBusy(true);
    setExportError(null);
    setExportNote(null);
    try {
      const fetched = await fetchPapersForSearch(services.db, user.uid, SEARCH_FETCH_CAP, ctx.cryptoKey);
      const content = format === "json" ? papersToJson(fetched.papers) : papersToMarkdown(fetched.papers);
      downloadTextFile(exportFilename(format === "json" ? "json" : "md", new Date()), content, format === "json" ? "application/json" : "text/markdown");
      const lockedNote =
        fetched.lockedCount > 0
          ? ` ${fetched.lockedCount} locked ${fetched.lockedCount === 1 ? "paper was" : "papers were"} not included in this export.`
          : "";
      setExportNote(
        (fetched.truncated
          ? `Exported the ${fetched.papers.length} most recently updated papers. Older papers were not included in this export.`
          : `Exported ${fetched.papers.length} ${fetched.papers.length === 1 ? "paper" : "papers"}.`) + lockedNote,
      );
    } catch (error) {
      setExportError(toAppError(error, "Export failed"));
    } finally {
      setExportBusy(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      await signOutFlow(services.auth);
      ctx.onSignOut();
    } catch (error) {
      setAccountError(toAppError(error, "Signing out failed"));
    } finally {
      setAccountBusy(false);
    }
  };

  const handleGoogleUpgrade = async (): Promise<void> => {
    setUpgradeConfirm(false);
    setAccountBusy(true);
    setAccountError(null);
    try {
      await signInWithGoogleFlow(services.auth);
    } catch (error) {
      setAccountError(toAppError(error, "Google sign-in failed"));
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1>Settings</h1>
        <p>Privacy controls, your account, and your data. Nothing here phones home.</p>
      </div>

      <section className="settings-block">
        <h2>Privacy</h2>
        <div className="toggle-row">
          <div>
            <p className="toggle-row-label">Strict mode</p>
            <p className="toggle-row-desc">
              Every AI action runs on this device only. Connect the dots is disabled. When the
              on-device model is not ready, actions fail honestly instead of using the cloud.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ctx.strictMode}
            aria-label="Strict mode"
            className="switch"
            onClick={() => ctx.onStrictModeChange(!ctx.strictMode)}
          >
            <span className="switch-thumb" />
          </button>
        </div>
        <p style={{ marginTop: 12 }}>
          Strict mode applies for this browser session. The default for new sessions is set by Remote
          Config ({config.strictModeDefault ? "on" : "off"}).
        </p>
      </section>

      <section className="settings-block">
        <h2>Encryption</h2>
        <p>
          Your papers are encrypted on this device with AES-GCM before they reach Firestore. The
          passphrase never leaves this device and is never stored. If you forget it, your papers
          cannot be recovered.
        </p>
        <p style={{ marginTop: 8 }}>
          Archive status: {ctx.cryptoKey !== null ? "unlocked on this device." : "locked."}
        </p>
        <div className="settings-actions">
          <button type="button" className="button button-secondary" onClick={() => ctx.onLock()}>
            Lock the archive
          </button>
        </div>
        <p style={{ marginTop: 8 }}>
          Changing the passphrase is not supported yet; the archive stays sealed with the passphrase
          you set first.
        </p>
      </section>

      <section className="settings-block">
        <h2>Account</h2>
        <p>
          {user.isAnonymous
            ? `Anonymous account. Your archive is tied to this browser identity (${user.uid}). If you clear site data, the archive stays behind - export regularly.`
            : `Signed in as ${user.email ?? user.uid}.`}
        </p>
        <p style={{ marginTop: 8 }}>
          Account created{" "}
          {formatDateTime(
            user.metadata.creationTime === undefined ? 0 : Date.parse(user.metadata.creationTime),
          )}
          .
        </p>
        {accountError !== null ? <ErrorPanel error={accountError} /> : null}
        <div className="settings-actions">
          {user.isAnonymous ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={accountBusy}
              onClick={() => setUpgradeConfirm(true)}
            >
              Sign in with Google instead
            </button>
          ) : null}
          <button type="button" className="button button-secondary" disabled={accountBusy} onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </section>

      <section className="settings-block">
        <h2>Your data</h2>
        <p>
          Export every paper you own as JSON (full data, including summaries and scan records) or
          Markdown (readable text). The export is generated in your browser and downloaded as a
          file; nothing is sent anywhere.
        </p>
        {exportError !== null ? <ErrorPanel error={exportError} /> : null}
        {exportNote !== null ? <InlineNotice text={exportNote} /> : null}
        <div className="settings-actions">
          <button type="button" className="button button-secondary" disabled={exportBusy} onClick={() => void exportPapers("json")}>
            {exportBusy ? "Preparing…" : "Export as JSON"}
          </button>
          <button type="button" className="button button-secondary" disabled={exportBusy} onClick={() => void exportPapers("markdown")}>
            {exportBusy ? "Preparing…" : "Export as Markdown"}
          </button>
        </div>
      </section>

      <section className="settings-block">
        <h2>About Hushfolio</h2>
        <p>
          A private papers archive built for the #BuildHybridAI 2026 hackathon. Hybrid inference via
          Firebase AI Logic: Gemini Nano on the device, {config.cloudModel} in the cloud, routed by
          action and by your choices, with every run recorded in the ledger. App Check, Remote
          Config, Authentication, and Firestore are all real Firebase services in this build - no
          demo mode exists anywhere in the app.
        </p>
        <p style={{ marginTop: 8 }}>
          Prompt version {config.promptVersion}. Cloud model {config.cloudModel}. Page size{" "}
          {config.pageSize}. Max paper size {config.maxPaperChars.toLocaleString()} characters.
        </p>
      </section>

      {upgradeConfirm ? (
        <ConfirmDialog
          title="Switch to a Google account?"
          body="Signing in with Google creates a separate, empty archive under that account. Your current anonymous archive stays under the anonymous account and will not move over. Export first if you want a copy."
          confirmLabel="Continue with Google"
          onConfirm={() => void handleGoogleUpgrade()}
          onCancel={() => setUpgradeConfirm(false)}
        />
      ) : null}
    </div>
  );
}
