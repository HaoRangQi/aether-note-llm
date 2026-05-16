import { beforeEach, describe, expect, it } from "vitest";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import type { Chunk, Note } from "../../../src/types.js";

function fakeNote(id: string, path: string, tags: string[] = []): Note {
  return {
    id,
    vaultPath: path,
    kind: "note",
    title: id,
    summary: null,
    tags,
    url: null,
    source: "manual",
    sourceMeta: {},
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    contentHash: "h",
    indexState: "fresh",
  };
}

function fakeChunk(
  noteId: string,
  ordinal: number,
  content: string,
  embedding: number[],
): Chunk {
  return {
    id: `${noteId}-${ordinal}`,
    noteId,
    ordinal,
    headingPath: "",
    content,
    tokenCount: 10,
    embeddingModel: "test",
    embedding,
  };
}

const DIM = 4;
function vec(seed: number): number[] {
  const v = [seed, seed * 2, seed * 3, seed * 4];
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

describe("OramaIndexStore", () => {
  let store: OramaIndexStore;
  beforeEach(async () => {
    store = new OramaIndexStore({ embeddingDim: DIM });
    await store.init();
  });

  it("upsert + getNote round-trip", () => {
    const n = fakeNote("n1", "a.md");
    store.upsertNote(n);
    expect(store.getNote("n1")?.id).toBe("n1");
  });

  it("setChunks adds rows; allChunks returns them", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await store.setChunks("n1", [fakeChunk("n1", 0, "alpha", vec(1))]);
    expect(store.allChunks()).toHaveLength(1);
  });

  it("setChunks replaces old chunks for the same note", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await store.setChunks("n1", [fakeChunk("n1", 0, "old", vec(1))]);
    await store.setChunks("n1", [
      fakeChunk("n1", 0, "new0", vec(2)),
      fakeChunk("n1", 1, "new1", vec(3)),
    ]);
    const chunks = store.allChunks();
    expect(chunks).toHaveLength(2);
    expect(chunks.find((c) => c.ordinal === 0)?.content).toBe("new0");
  });

  it("EMBED_DIM_MISMATCH when chunk dim wrong", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await expect(
      store.setChunks("n1", [fakeChunk("n1", 0, "x", [0, 0, 0])]),
    ).rejects.toMatchObject({ code: "EMBED_DIM_MISMATCH" });
  });

  it("hybrid search returns matching chunks", async () => {
    store.upsertNote(fakeNote("n1", "alpha.md"));
    store.upsertNote(fakeNote("n2", "beta.md"));
    await store.setChunks("n1", [
      fakeChunk("n1", 0, "alpha keyword in this chunk", vec(1)),
    ]);
    await store.setChunks("n2", [
      fakeChunk("n2", 0, "completely different content", vec(9)),
    ]);
    const hits = await store.searchHybrid({
      query: "alpha",
      vector: vec(1),
      limit: 5,
      alpha: 0.5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.noteId).toBe("n1");
  });

  it("filters by kind", async () => {
    const a = { ...fakeNote("n1", "a.md"), kind: "note" as const };
    const b = { ...fakeNote("n2", "b.md"), kind: "bookmark" as const };
    store.upsertNote(a);
    store.upsertNote(b);
    await store.setChunks("n1", [fakeChunk("n1", 0, "shared word", vec(1))]);
    await store.setChunks("n2", [fakeChunk("n2", 0, "shared word", vec(1))]);
    const hits = await store.searchHybrid({
      query: "shared",
      vector: vec(1),
      limit: 5,
      alpha: 0.5,
      filters: { kind: "bookmark" },
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.kind === "bookmark")).toBe(true);
  });

  it("setEmbeddingDim resets the underlying index", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await store.setChunks("n1", [fakeChunk("n1", 0, "x", vec(1))]);
    await store.setEmbeddingDim(8);
    // After dim change, prior chunks are gone (intentional).
    expect(store.allChunks()).toEqual([]);
  });
});
