import { describe, expect, it } from "vitest";
import { detectDuplicate } from "../../../src/import/duplicate-detector.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import type { Note } from "../../../src/types.js";

function vec(seed: number, dim = 4): number[] {
  const v = Array.from({ length: dim }, (_, i) => Math.sin(seed + i));
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function fakeNote(id: string): Note {
  return {
    id,
    vaultPath: `${id}.md`,
    kind: "note",
    title: id,
    summary: null,
    tags: [],
    url: null,
    source: "manual",
    sourceMeta: {},
    createdAt: 0,
    updatedAt: 0,
    contentHash: "h",
    indexState: "fresh",
  };
}

describe("detectDuplicate", () => {
  it("returns null on empty content", async () => {
    const store = new OramaIndexStore({ embeddingDim: 4 });
    await store.init();
    const dup = await detectDuplicate({ store, content: "  ", vector: vec(1) });
    expect(dup).toBeNull();
  });

  it("returns noteId when a near-identical chunk exists", async () => {
    const store = new OramaIndexStore({ embeddingDim: 4 });
    await store.init();
    store.upsertNote(fakeNote("n1"));
    const v = vec(1);
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "same identical text",
        tokenCount: 4,
        embeddingModel: "m",
        embedding: v,
      },
    ]);
    const dup = await detectDuplicate({
      store,
      content: "same identical text",
      vector: v,
      vectorThreshold: 0.5,
    });
    expect(dup).toBe("n1");
  });

  it("returns null when scores are below threshold", async () => {
    const store = new OramaIndexStore({ embeddingDim: 4 });
    await store.init();
    store.upsertNote(fakeNote("n1"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "alpha",
        tokenCount: 1,
        embeddingModel: "m",
        embedding: vec(1),
      },
    ]);
    const dup = await detectDuplicate({
      store,
      content: "totally different",
      vector: vec(99),
      vectorThreshold: 0.99,
    });
    expect(dup).toBeNull();
  });
});
