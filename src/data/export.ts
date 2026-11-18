// Export: papers out, as JSON or Markdown. Pure string builders plus one
// small download helper. Exports contain exactly the paper data — no
// account identifiers, no ledger metadata.

import type { Paper } from "../types";

export function papersToJson(papers: readonly Paper[]): string {
  const portable = papers.map((paper) => ({
    title: paper.title,
    body: paper.body,
    tags: paper.tags,
    mood: paper.mood,
    summary: paper.summary,
    sensitivity: paper.sensitivity,
    photo: paper.photo,
    createdAt: new Date(paper.createdAt).toISOString(),
    updatedAt: new Date(paper.updatedAt).toISOString(),
  }));
  return JSON.stringify({ exportedAt: new Date().toISOString(), papers: portable }, null, 2);
}

export function papersToMarkdown(papers: readonly Paper[]): string {
  const chunks: string[] = [];
  for (const paper of papers) {
    chunks.push(`# ${paper.title}`);
    chunks.push("");
    chunks.push(`Filed: ${new Date(paper.createdAt).toISOString()}`);
    if (paper.tags.length > 0) {
      chunks.push(`Tags: ${paper.tags.join(", ")}`);
    }
    if (paper.summary !== null) {
      chunks.push("");
      chunks.push(`Summary: ${paper.summary}`);
    }
    chunks.push("");
    chunks.push(paper.body);
    chunks.push("");
    chunks.push("---");
    chunks.push("");
  }
  return chunks.join("\n");
}

export function exportFilename(kind: "json" | "md", now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
  return `hushfolio-export-${stamp}.${kind}`;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
