// Small pure helpers shared by views. No Firebase imports here.

export function formatDateTime(epochMs: number): string {
  if (epochMs <= 0) {
    return "Unknown date";
  }
  return new Date(epochMs).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}…`;
}

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export interface PhotoFileData {
  base64: string;
  mimeType: "image/jpeg" | "image/png";
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export type PhotoFileResult =
  | { ok: true; data: PhotoFileData }
  | { ok: false; reason: string };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read the file as a data URL."));
      }
    };
    reader.onerror = () => {
      reject(new Error("Could not read the file."));
    };
    reader.readAsDataURL(file);
  });
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Could not decode the image."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Validate and decode a user-picked photo. The bytes stay in memory in the
 * calling view; nothing here uploads anything anywhere.
 */
export async function photoFileToData(file: File): Promise<PhotoFileResult> {
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    return { ok: false, reason: "Only JPEG and PNG photos are supported for on-device reading." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "The photo is larger than 8 MB. Choose a smaller file." };
  }
  try {
    const [dataUrl, dims] = await Promise.all([readFileAsDataUrl(file), readImageDimensions(file)]);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) {
      return { ok: false, reason: "The photo could not be read. Try a different file." };
    }
    return {
      ok: true,
      data: {
        base64: dataUrl.slice(comma + 1),
        mimeType: file.type,
        name: file.name,
        width: dims.width,
        height: dims.height,
        sizeBytes: file.size,
      },
    };
  } catch {
    return { ok: false, reason: "The photo could not be decoded. Try a different file." };
  }
}
