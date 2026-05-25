import { create, insertMultiple, removeMultiple, search, type AnyOrama } from "@orama/orama";
import { AetherError } from "../errors.js";
import type { Chunk, Note, NoteKind, SearchFilters } from "../types.js";

interface ChunkRow {
  id: string;
  noteId: string;
  ordinal: number;
  headingPath: string;
  content: string;
  tokenCount: number;
  embedding: number[];
  kind: NoteKind;
  tags: string[];
  vaultPath: string;
  createdAt: number;
}

export interface OramaStoreOptions {
  embeddingDim: number;
}

export interface VectorSearchHit {
  chunkId: string;
  noteId: string;
  vaultPath: string;
  headingPath: string;
  content: string;
  tokenCount: number;
  score: number;
  kind: NoteKind;
  tags: string[];
}

interface OramaRow {
  id: string;
  noteId: string;
  ordinal: number;
  headingPath: string;
  content: string;
  tokenCount: number;
  embedding: number[];
  kind: string;
  tags: string[];
  vaultPath: string;
  createdAt: number;
}

export class OramaIndexStore {
  private orama!: AnyOrama;
  private notes = new Map<string, Note>();
  private chunkRows = new Map<string, ChunkRow>();
  private embeddingDim: number;

  constructor(opts: OramaStoreOptions) {
    this.embeddingDim = opts.embeddingDim;
  }

  async init(): Promise<void> {
    this.orama = await create({
      schema: {
        id: "string",
        noteId: "string",
        ordinal: "number",
        headingPath: "string",
        content: "string",
        tokenCount: "number",
        embedding: `vector[${this.embeddingDim}]`,
        kind: "string",
        tags: "string[]",
        vaultPath: "string",
        createdAt: "number",
      },
    } as never);
    this.chunkRows.clear();
  }

  async setEmbeddingDim(dim: number): Promise<void> {
    if (dim === this.embeddingDim) return;
    this.embeddingDim = dim;
    // Reinitialise the underlying orama instance with the new vector schema.
    // Caller MUST then re-upsert all chunks; we deliberately do not attempt
    // to preserve the prior rows because their vectors are no longer valid.
    await this.init();
  }

  async clearChunks(): Promise<void> {
    const ids = [...this.chunkRows.keys()];
    if (ids.length > 0) await removeMultiple(this.orama, ids);
    this.chunkRows.clear();
  }

  // ---- Notes ----
  upsertNote(note: Note): void {
    this.notes.set(note.id, note);
  }
  async removeNote(noteId: string): Promise<void> {
    const toRemove: string[] = [];
    for (const [id, row] of this.chunkRows) {
      if (row.noteId === noteId) toRemove.push(id);
    }
    if (toRemove.length > 0) {
      await removeMultiple(this.orama, toRemove);
      for (const id of toRemove) this.chunkRows.delete(id);
    }
    this.notes.delete(noteId);
  }
  getNote(noteId: string): Note | undefined {
    return this.notes.get(noteId);
  }
  allNotes(): Note[] {
    return [...this.notes.values()];
  }

  // ---- Chunks ----
  async setChunks(noteId: string, chunks: Chunk[]): Promise<void> {
    const toRemove: string[] = [];
    for (const [id, row] of this.chunkRows) {
      if (row.noteId === noteId) toRemove.push(id);
    }
    if (toRemove.length > 0) {
      await removeMultiple(this.orama, toRemove);
      for (const id of toRemove) this.chunkRows.delete(id);
    }
    const note = this.notes.get(noteId);
    if (!note) throw new AetherError("INDEX_CORRUPT", `setChunks: missing note ${noteId}`);
    const rows: ChunkRow[] = chunks.map((c) => ({
      id: c.id,
      noteId: c.noteId,
      ordinal: c.ordinal,
      headingPath: c.headingPath,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: c.embedding ?? new Array<number>(this.embeddingDim).fill(0),
      kind: note.kind,
      tags: note.tags,
      vaultPath: note.vaultPath,
      createdAt: note.createdAt,
    }));
    if (rows.length === 0) return;
    for (const r of rows) {
      if (r.embedding.length !== this.embeddingDim) {
        throw new AetherError(
          "EMBED_DIM_MISMATCH",
          `Chunk ${r.id}: expected dim ${this.embeddingDim}, got ${r.embedding.length}`,
        );
      }
    }
    await insertMultiple(this.orama, rows as unknown as Parameters<typeof insertMultiple>[1]);
    for (const r of rows) this.chunkRows.set(r.id, r);
  }

  allChunks(): Chunk[] {
    return [...this.chunkRows.values()].map((r) => ({
      id: r.id,
      noteId: r.noteId,
      ordinal: r.ordinal,
      headingPath: r.headingPath,
      content: r.content,
      tokenCount: r.tokenCount,
      embeddingModel: null,
      embedding: r.embedding,
    }));
  }

  chunksForNote(noteId: string): Chunk[] {
    return [...this.chunkRows.values()]
      .filter((r) => r.noteId === noteId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((r) => ({
        id: r.id,
        noteId: r.noteId,
        ordinal: r.ordinal,
        headingPath: r.headingPath,
        content: r.content,
        tokenCount: r.tokenCount,
        embeddingModel: null,
        embedding: r.embedding,
      }));
  }

  // ---- Search ----
  async searchHybrid(args: {
    query: string;
    vector: number[];
    filters?: SearchFilters;
    limit: number;
    alpha: number; // text weight
  }): Promise<VectorSearchHit[]> {
    if (args.vector.length !== this.embeddingDim) {
      throw new AetherError(
        "EMBED_DIM_MISMATCH",
        `query dim ${args.vector.length} != index dim ${this.embeddingDim}`,
      );
    }
    const where = buildWhere(args.filters);
    const searchParams: Record<string, unknown> = {
      mode: "hybrid",
      term: args.query,
      vector: { value: args.vector, property: "embedding" },
      similarity: 0.0,
      hybridWeights: { text: args.alpha, vector: 1 - args.alpha },
      limit: rawLimit(args.limit, args.filters),
    };
    if (where) searchParams["where"] = where;
    const result = (await search(this.orama, searchParams as Parameters<typeof search>[1])) as {
      hits: Array<{ document: OramaRow; score: number }>;
    };
    return result.hits
      .map((h) => rowToHit(this.chunkRows.get(h.document.id) ?? h.document, h.score))
      .filter((hit) => matchesPathPrefix(hit.vaultPath, args.filters?.pathPrefix))
      .slice(0, args.limit);
  }

  async searchText(args: {
    query: string;
    filters?: SearchFilters;
    limit: number;
  }): Promise<VectorSearchHit[]> {
    const where = buildWhere(args.filters);
    const searchParams: Record<string, unknown> = {
      term: args.query,
      limit: rawLimit(args.limit, args.filters),
    };
    if (where) searchParams["where"] = where;
    const result = (await search(this.orama, searchParams as Parameters<typeof search>[1])) as {
      hits: Array<{ document: OramaRow; score: number }>;
    };
    return result.hits
      .map((h) => rowToHit(this.chunkRows.get(h.document.id) ?? h.document, h.score))
      .filter((hit) => matchesPathPrefix(hit.vaultPath, args.filters?.pathPrefix))
      .slice(0, args.limit);
  }
}

function buildWhere(f: SearchFilters | undefined): Record<string, unknown> | undefined {
  if (!f) return undefined;
  const w: Record<string, unknown> = {};
  if (f.kind) w["kind"] = f.kind;
  // orama tag filter: array means "contains any"; we use that and rely on
  // most tag filters being single-tag anyway.
  if (f.tags && f.tags.length > 0) w["tags"] = f.tags;
  if (f.after !== undefined || f.before !== undefined) {
    const range: Record<string, number> = {};
    if (f.after !== undefined) range["gte"] = f.after;
    if (f.before !== undefined) range["lte"] = f.before;
    w["createdAt"] = range;
  }
  return Object.keys(w).length > 0 ? w : undefined;
}

function rawLimit(limit: number, filters: SearchFilters | undefined): number {
  return filters?.pathPrefix ? limit * 10 : limit;
}

function matchesPathPrefix(vaultPath: string, pathPrefix: string | undefined): boolean {
  if (!pathPrefix) return true;
  const prefix = pathPrefix.replace(/\/+$/, "");
  return vaultPath === prefix || vaultPath.startsWith(`${prefix}/`);
}

function rowToHit(row: ChunkRow | OramaRow, score: number): VectorSearchHit {
  return {
    chunkId: row.id,
    noteId: row.noteId,
    vaultPath: row.vaultPath,
    headingPath: row.headingPath,
    content: row.content,
    tokenCount: row.tokenCount,
    score,
    kind: row.kind as NoteKind,
    tags: row.tags,
  };
}
