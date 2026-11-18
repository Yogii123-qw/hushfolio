import type { JSX } from "react";
import { AppError } from "../errors";
import { CloudIcon, DeviceIcon, SealIcon, WarningIcon } from "./icons";
import type { InferenceSourceValue } from "../types";

export function SourcePill({ source }: { source: InferenceSourceValue }): JSX.Element {
  if (source === "on_device") {
    return (
      <span className="pill pill-device">
        <DeviceIcon size={14} /> On this device
      </span>
    );
  }
  if (source === "in_cloud") {
    return (
      <span className="pill pill-cloud">
        <CloudIcon size={14} /> Cloud
      </span>
    );
  }
  return <span className="pill pill-none">Not run</span>;
}

export function SealBadge({ label }: { label: string }): JSX.Element {
  return (
    <span className="seal-badge" title="Sealed: this content was processed on this device only">
      <SealIcon size={16} /> {label}
    </span>
  );
}

export function ProgressBar({ fraction, label }: { fraction: number; label: string }): JSX.Element {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="progress-wrap">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <span className="progress-label">
        {label}: {percent}%
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel !== undefined && onAction !== undefined ? (
        <button type="button" className="button button-primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
  retryLabel = "Try again",
}: {
  error: AppError;
  onRetry?: () => void;
  retryLabel?: string;
}): JSX.Element {
  return (
    <div className="error-panel" role="alert">
      <div className="error-panel-head">
        <WarningIcon /> <strong>Something needs attention</strong>
      </div>
      <p>{error.message}</p>
      <p className="error-next">{error.nextStep}</p>
      {onRetry !== undefined ? (
        <button type="button" className="button button-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function InlineNotice({ text, tone = "info" }: { text: string; tone?: "info" | "warn" }): JSX.Element {
  return <p className={tone === "warn" ? "notice notice-warn" : "notice"}>{text}</p>;
}
