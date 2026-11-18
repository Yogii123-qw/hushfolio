import { useEffect, useRef, useState, type JSX } from "react";
import { createHybridModel, downloadDeviceModel } from "../ai/hybrid";
import type { AppContext } from "../appContext";
import { ErrorPanel, ProgressBar } from "../components/feedback";
import { listPapersPage } from "../data/papers";
import { toAppError, type AppError } from "../errors";
import type { DeviceModelStatus } from "../types";

const DEVICE_STATUS_LABELS: Record<DeviceModelStatus, string> = {
  unknown: "Not checked yet",
  unsupported: "Not supported in this browser",
  unavailable: "Not available on this device",
  downloadable: "Available to download",
  downloading: "Downloading",
  available: "Ready on this device",
  error: "Check failed",
};

export function StatusView({ ctx }: { ctx: AppContext }): JSX.Element {
  const { services, user, config, configMeta, appCheck, deviceProbe } = ctx;
  const [firestoreState, setFirestoreState] = useState<"checking" | "reachable" | "unreachable">("checking");
  const [firestoreError, setFirestoreError] = useState<AppError | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<AppError | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await listPapersPage(services.db, user.uid, 1, null);
        if (mountedRef.current) setFirestoreState("reachable");
      } catch (probeError) {
        if (!mountedRef.current) return;
        setFirestoreState("unreachable");
        setFirestoreError(toAppError(probeError, "Firestore check failed"));
      }
    })();
  }, [services.db, user.uid]);

  const startDownload = async (): Promise<void> => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadDone(false);
    setProgress(0);
    try {
      const model = createHybridModel(services.ai, {
        mode: "prefer_on_device",
        cloudModel: config.cloudModel,
      });
      await downloadDeviceModel(model, (fraction) => {
        if (mountedRef.current) setProgress(fraction);
      });
      if (!mountedRef.current) return;
      setDownloadDone(true);
      ctx.onRefreshDeviceProbe();
    } catch (error) {
      if (mountedRef.current) setDownloadError(toAppError(error, "On-device model download failed"));
    } finally {
      if (mountedRef.current) setDownloading(false);
    }
  };

  const rows: Array<{ name: string; value: string }> = [
    { name: "Firebase project", value: services.projectId },
    {
      name: "Signed in as",
      value: user.isAnonymous ? `Anonymous account (${user.uid})` : (user.email ?? user.uid),
    },
    {
      name: "App Check",
      value: `${appCheck.mode === "recaptcha" ? "Active (reCAPTCHA v3)" : appCheck.mode === "debug" ? "Debug mode" : "Not active"} — ${appCheck.detail}`,
    },
    {
      name: "Firestore",
      value:
        firestoreState === "checking"
          ? "Checking…"
          : firestoreState === "reachable"
            ? "Reachable. Your papers and ledger live under your account only."
            : "Unreachable. See the error below.",
    },
    {
      name: "Remote Config",
      value: configMeta.fetched
        ? `Fetched from the server. ${configMeta.invalidKeys.length > 0 ? `Invalid values ignored and replaced with defaults: ${configMeta.invalidKeys.join(", ")}.` : "All values valid."}`
        : `Using built-in defaults (fetch ${configMeta.fetchErrorCode !== null ? `failed: ${configMeta.fetchErrorCode}` : "did not run"}).`,
    },
    {
      name: "Remote Config values",
      value: `Default mode ${config.defaultMode}; Strict default ${config.strictModeDefault ? "on" : "off"}; Cloud ${config.cloudEnabled ? "enabled" : "disabled"}; Max paper ${config.maxPaperChars.toLocaleString()} characters; Page size ${config.pageSize}; Photos ${config.photoEnabled ? "enabled" : "disabled"}; Cloud model ${config.cloudModel}; Prompt version ${config.promptVersion}.`,
    },
    {
      name: "AI Logic backend",
      value: `Gemini Developer API (Firebase AI Logic). Cloud model: ${config.cloudModel}. Hybrid inference requires Chrome on desktop, version 139 or higher.`,
    },
    { name: "Network", value: ctx.online ? "Online" : "Offline — AI actions use the on-device model only." },
    {
      name: "On-device model",
      value: `${DEVICE_STATUS_LABELS[deviceProbe.status]}. ${deviceProbe.detail}`,
    },
  ];

  return (
    <div>
      <div className="view-head">
        <h1>Status</h1>
        <p>
          Every subsystem, stated plainly. If something is not working, this page says what and
          what to do next — nothing here is guessed.
        </p>
      </div>

      <div className="status-list">
        {rows.map((row) => (
          <div className="status-row" key={row.name}>
            <span className="status-row-name">{row.name}</span>
            <span className="status-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      {firestoreError !== null && firestoreState === "unreachable" ? <ErrorPanel error={firestoreError} /> : null}

      <section className="connect-panel" aria-label="On-device model">
        <h2 className="section-title">On-device model</h2>
        <p>
          Seal Scan and the on-device path of every other action need the Gemini Nano model in this
          browser. Downloading it is a one-time, on-device step started only by you.
        </p>
        <div className="ai-action-controls">
          <button
            type="button"
            className="button button-primary"
            disabled={downloading || deviceProbe.status === "available" || deviceProbe.status === "unsupported" || deviceProbe.status === "unavailable"}
            onClick={() => void startDownload()}
          >
            {downloading ? "Downloading…" : deviceProbe.status === "available" ? "Model ready" : "Download the on-device model"}
          </button>
          <button type="button" className="button button-secondary" onClick={ctx.onRefreshDeviceProbe} disabled={downloading}>
            Check again
          </button>
        </div>
        {downloading ? <ProgressBar fraction={progress} label="Model download" /> : null}
        {downloadDone ? (
          <p style={{ marginTop: 12, fontSize: 14, color: "var(--device)" }}>
            Download finished. The status above will update after the check completes.
          </p>
        ) : null}
        {downloadError !== null ? <ErrorPanel error={downloadError} /> : null}
      </section>
    </div>
  );
}
