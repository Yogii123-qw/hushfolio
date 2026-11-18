// PREVIEW FIXTURE — stands in for src/ai/hybrid.ts in the preview
// bundle only. Never imported by production code.

export function createHybridModel() {
  return {};
}

export async function downloadDeviceModel(_model: unknown, onProgress: (fraction: number) => void) {
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    onProgress(fraction);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export function readInferenceSource() {
  return "none";
}

export function requireResponseText() {
  return "";
}
