// Structured logging. Callers pass an event name and metadata fields only.
// Paper bodies, prompts, and model outputs must NEVER be passed here:
// the signature accepts only scalar metadata, and reviewers should treat
// any log call carrying user content as a defect.

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, fields: LogFields): void {
  const stamp = new Date().toISOString();
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  const line = `[hushfolio] ${stamp} ${level} ${event}${parts ? ` ${parts}` : ""}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, fields: LogFields = {}): void {
  emit("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  emit("warn", event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  emit("error", event, fields);
}
