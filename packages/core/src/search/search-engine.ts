import { AetherError } from "../errors.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import type {
  HitChunk,
  Note,
  SearchFallbackReason,
  SearchHit,
  SearchMeta,
  SearchRequest,
  SearchResponse,
  TokenUsage,
} from "../types.js";
import type { OramaIndexStore } from "../index-store/orama-store.js";

export interface SearchEngineDeps {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  store: OramaIndexStore;
  /** Returns 0..1 — what fraction of chunks are stale; SearchEngine biases towards BM25 when high. */
  getStaleRatio?: () => number;
  onUsage?: (args: {
    providerId: string;
    feature: "embedding";
    model: string;
    usage: TokenUsage;
  }) => void | Promise<void>;
}

export interface SearchRunOptions {
  forceText?: boolean;
  textFallbackReason?: SearchFallbackReason;
  embeddingOverride?: {
    providerId: string;
    modelName: string;
  };
}

export class SearchEngine {
  constructor(private readonly deps: SearchEngineDeps) {}

  async search(req: SearchRequest, options: SearchRunOptions = {}): Promise<SearchHit[]> {
    return (await this.searchWithMeta(req, options)).hits;
  }

  async searchWithMeta(req: SearchRequest, options: SearchRunOptions = {}): Promise<SearchResponse> {
    const limit = req.limit ?? 20;
    const baseAlpha = req.alpha ?? 0.4;
    const staleRatio = this.deps.getStaleRatio?.() ?? 0;
    // When more than 30% of chunks are stale, raise alpha towards 0.8 linearly.
    const alpha = clamp01(
      staleRatio > 0.3
        ? Math.max(baseAlpha, 0.4 + ((staleRatio - 0.3) * (0.8 - 0.4)) / 0.7)
        : baseAlpha,
    );

    const { rawHits, fallbackReason } = await this.searchWithBestAvailableIndex({
      query: req.query,
      filters: req.filters,
      limit: limit * 2,
      alpha,
      ...options,
    });
    const meta: SearchMeta = {
      mode: fallbackReason ? "bm25" : staleRatio > 0.3 ? "stale-biased" : "hybrid",
      alpha,
      staleRatio,
      fallbackReason,
    };

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
        content: h.content,
        tokenCount: h.tokenCount,
        score: h.score,
      };
      if (existing) {
        if (existing.chunks.length < 3) existing.chunks.push(hc);
        existing.score = Math.max(existing.score, h.score);
      } else {
        byNote.set(h.noteId, { note, chunks: [hc], score: h.score });
      }
    }

    const hits = [...byNote.values()]
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
    return { hits, meta };
  }

  private async searchWithBestAvailableIndex(args: {
    query: string;
    filters: SearchRequest["filters"];
    limit: number;
    alpha: number;
    forceText?: boolean;
    textFallbackReason?: SearchFallbackReason;
    embeddingOverride?: {
      providerId: string;
      modelName: string;
    };
  }): Promise<{
    rawHits: Awaited<ReturnType<OramaIndexStore["searchHybrid"]>>;
    fallbackReason: SearchFallbackReason | null;
  }> {
    if (args.forceText) {
      const searchArgs: Parameters<typeof this.deps.store.searchText>[0] = {
        query: args.query,
        limit: args.limit,
      };
      if (args.filters) searchArgs.filters = args.filters;
      return {
        rawHits: await this.deps.store.searchText(searchArgs),
        fallbackReason: args.textFallbackReason ?? "provider-error",
      };
    }
    try {
      const role = this.deps.roles.resolve("embedding");
      const providerId = args.embeddingOverride?.providerId ?? role.providerId;
      const modelName = args.embeddingOverride?.modelName ?? role.modelName;
      const provider = this.deps.registry.getProvider(providerId);
      const embed = await provider.embed({ inputs: [args.query], model: modelName });
      if (embed.usage) {
        await this.deps.onUsage?.({
          providerId: provider.id,
          feature: "embedding",
          model: modelName,
          usage: embed.usage,
        });
      }
      const vector = embed.vectors[0] ?? [];

      const searchArgs: Parameters<typeof this.deps.store.searchHybrid>[0] = {
        query: args.query,
        vector,
        limit: args.limit,
        alpha: args.alpha,
      };
      if (args.filters) searchArgs.filters = args.filters;
      return {
        rawHits: await this.deps.store.searchHybrid(searchArgs),
        fallbackReason: null,
      };
    } catch (e) {
      if (e instanceof AetherError && e.code === "EMBED_DIM_MISMATCH") {
        throw e;
      }
      const fallbackReason = toFallbackReason(e);
      if (fallbackReason) {
        const searchArgs: Parameters<typeof this.deps.store.searchText>[0] = {
          query: args.query,
          limit: args.limit,
        };
        if (args.filters) searchArgs.filters = args.filters;
        return {
          rawHits: await this.deps.store.searchText(searchArgs),
          fallbackReason,
        };
      }
      throw e;
    }
  }
}

function toFallbackReason(e: unknown): SearchFallbackReason | null {
  if (!(e instanceof AetherError)) return null;
  switch (e.code) {
    case "BINDING_NOT_FOUND":
      return "embedding-role-missing";
    case "PROVIDER_NOT_FOUND":
      return "provider-missing";
    case "API_KEY_MISSING":
      return "api-key-missing";
    case "PROVIDER_CONFIG_INVALID":
    case "PROVIDER_HTTP_ERROR":
      return "provider-error";
    default:
      return null;
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
