// PREVIEW FIXTURE - stands in for src/ai/actions.ts in the preview
// bundle only. Returns canned results so the AI panel layout can be
// reviewed. The canned text is labeled as a preview fixture in the
// harness banner; it never ships in the production bundle.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runAiAction(_runtime: unknown, request: any) {
  await delay(120);
  switch (request.action) {
    case "seal_scan":
      return {
        action: "seal_scan",
        data: {
          level: "low",
          categories: ["names"],
          notes: "Names of people were found; no identity or financial details.",
          redactedPreview: "The harbor was quiet at dawn. [NAME] packed sandwiches and a thermos of coffee.",
        },
        source: "on_device",
        durationMs: 1840,
        ledgerRecorded: true,
      };
    case "summarize":
      return {
        action: "summarize",
        data: {
          title: "Harbor morning",
          summary: "A quiet morning at the harbor before the ferry crossing.",
          tags: ["travel", "harbor"],
          mood: "calm",
        },
        source: "on_device",
        durationMs: 2310,
        ledgerRecorded: true,
      };
    case "ask": {
      const chunks = ["The harbor ", "was quiet ", "at dawn."];
      for (const chunk of chunks) {
        request.onStreamChunk?.(chunk);
        await delay(60);
      }
      return {
        action: "ask",
        data: { answer: "The harbor was quiet at dawn." },
        source: "on_device",
        durationMs: 940,
        ledgerRecorded: true,
      };
    }
    case "photo_read":
      return {
        action: "photo_read",
        data: {
          transcription: "Dear Grandma, thank you for the birthday parcel.",
          description: "A handwritten letter on lined paper, four short paragraphs.",
          docType: "letter",
          confidence: "high",
        },
        source: "on_device",
        durationMs: 4200,
        ledgerRecorded: true,
      };
    case "connect_dots":
      return {
        action: "connect_dots",
        data: {
          themes: ["The harbor", "Family visits"],
          connections: [
            {
              firstPaper: "Harbor morning",
              secondPaper: "Letter draft to grandmother",
              relation: "Both mention family plans for the coming weeks.",
            },
          ],
          timeline: [{ label: "Friday", detail: "The ferry schedule must be checked before Friday." }],
        },
        source: "in_cloud",
        durationMs: 5800,
        ledgerRecorded: true,
      };
    default:
      throw new Error(`Unknown preview action: ${String(request.action)}`);
  }
}
