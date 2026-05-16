import type { OramaIndexStore } from "../index-store/orama-store.js";

export interface DupCheckArgs {
  store: OramaIndexStore;
  content: string;
  vector: number[];
  vectorThreshold?: number; // default 0.92
}

export async function detectDuplicate(args: DupCheckArgs): Promise<string | null> {
  const threshold = args.vectorThreshold ?? 0.92;
  if (args.content.trim().length === 0) return null;
  try {
    const hits = await args.store.searchHybrid({
      query: args.content.slice(0, 200),
      vector: args.vector,
      limit: 5,
      alpha: 0,
    });
    for (const h of hits) {
      if (h.score >= threshold) return h.noteId;
    }
  } catch {
    return null;
  }
  return null;
}
