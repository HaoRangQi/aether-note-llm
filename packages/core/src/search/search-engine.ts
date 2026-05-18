import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import type { HitChunk, Note, SearchHit, SearchRequest } from "../types.js";
import type { OramaIndexStore } from "../index-store/orama-store.js";

export interface SearchEngineDeps {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  store: OramaIndexStore;
  /** Returns 0..1 — what fraction of chunks are stale; SearchEngine biases towards BM25 when high. */
  getStaleRatio?: () => number;
}

export class SearchEngine {
  constructor(private readonly deps: SearchEngineDeps) {}

  async search(req: SearchRequest): Promise<SearchHit[]> {
    const limit = req.limit ?? 20;
    const baseAlpha = req.alpha ?? 0.4;
    const staleRatio = this.deps.getStaleRatio?.() ?? 0;
    // When more than 30% of chunks are stale, raise alpha towards 0.8 linearly.
    const alpha = clamp01(
      staleRatio > 0.3
        ? Math.max(baseAlpha, 0.4 + ((staleRatio - 0.3) * (0.8 - 0.4)) / 0.7)
        : baseAlpha,
    );

    const role = this.deps.roles.resolve("embedding");
    const provider = this.deps.registry.getProvider(role.providerId);
    const embed = await provider.embed({ inputs: [req.query], model: role.modelName });
    const vector = embed.vectors[0] ?? [];

    const searchArgs: Parameters<typeof this.deps.store.searchHybrid>[0] = {
      query: req.query,
      vector,
      limit: limit * 2,
      alpha,
    };
    if (req.filters) searchArgs.filters = req.filters;
    const rawHits = await this.deps.store.searchHybrid(searchArgs);

    // Group chunks by note, keep top chunks per note (max 3).
    const byNote = new Map<string, { note: Note; chunks: HitChunk[]; score: number }>();
    for (const h of rawHits) {
      const note = this.deps.store.getNote(h.noteId);
      if (!note) continue;
      const existing = byNote.get(h.noteId);
      const hc: HitChunk = {
        chunkId: h.chunkId,
        headingPath: h.headingPath,
        excerpt: excerpt(h.content, req.query),
        score: h.score,
      };
      if (existing) {
        if (existing.chunks.length < 3) existing.chunks.push(hc);
        existing.score = Math.max(existing.score, h.score);
      } else {
        byNote.set(h.noteId, { note, chunks: [hc], score: h.score });
      }
    }

    return [...byNote.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ note, chunks, score }) => ({
        noteId: note.id,
        vaultPath: note.vaultPath,
        kind: note.kind,
        title: note.title,
        summary: note.summary,
        tags: note.tags,
        url: note.url,
        topChunks: chunks,
        score,
      }));
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function excerpt(content: string, query: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  const idx = trimmed.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return trimmed.slice(0, 200);
  const start = Math.max(0, idx - 80);
  const end = Math.min(trimmed.length, idx + query.length + 80);
  return (start > 0 ? "…" : "") + trimmed.slice(start, end) + (end < trimmed.length ? "…" : "");
}
