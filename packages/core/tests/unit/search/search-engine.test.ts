import { describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { RoleRegistry } from "../../../src/roles/role-registry.js";
import { BUILTIN_ROLE_SEEDS, seedToRole } from "../../../src/roles/default-roles.js";
import { SearchEngine } from "../../../src/search/search-engine.js";
import type { ProviderFactory } from "../../../src/provider/types.js";
import type { Note } from "../../../src/types.js";

function fakeNote(id: string, path: string, title: string): Note {
  return {
    id,
    vaultPath: path,
    kind: "note",
    title,
    summary: null,
    tags: [],
    url: null,
    source: "manual",
    sourceMeta: {},
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    contentHash: "h",
    indexState: "fresh",
  };
}

function deterministic(seed: string, dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  for (let i = 0; i < seed.length; i++) {
    out[i % dim]! += (seed.charCodeAt(i) % 13) / 13;
  }
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map((v) => v / norm);
}

async function makeRig(mockOptions: ConstructorParameters<typeof MockProvider>[0] = {}) {
  const store = new OramaIndexStore({ embeddingDim: 8 });
  await store.init();
  const mock = new MockProvider({ embedDim: 8, ...mockOptions });
  const factory: ProviderFactory = { kind: "openai-compatible", create: () => mock };
  const reg = new ProviderRegistry({
    factories: [factory],
    fetch: async () => new Response("{}"),
  });
  reg.setConfigs([
    {
      id: "p",
      name: "p",
      baseUrl: "https://x",
      apiKeyRef: "k",
      defaultHeaders: {},
      enabled: true,
      createdAt: 0,
    },
  ]);
  reg.setApiKeys({ k: "secret" });
  const roles = new RoleRegistry();
  const embedSeed = BUILTIN_ROLE_SEEDS.find((s) => s.id === "embedding")!;
  const embedRole = seedToRole(embedSeed, 0);
  embedRole.providerId = "p";
  embedRole.modelName = "m";
  roles.setRoles([embedRole]);
  const engine = new SearchEngine({ registry: reg, roles, store });
  return { store, mock, engine, reg, roles };
}

describe("SearchEngine", () => {
  it("returns notes ranked by hybrid score", async () => {
    const { store, engine } = await makeRig();
    store.upsertNote(fakeNote("n1", "alpha.md", "Alpha"));
    store.upsertNote(fakeNote("n2", "beta.md", "Beta"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "How to debug SwiftUI state loss",
        tokenCount: 8,
        embeddingModel: "m",
        embedding: deterministic("How to debug SwiftUI state loss", 8),
      },
    ]);
    await store.setChunks("n2", [
      {
        id: "c2",
        noteId: "n2",
        ordinal: 0,
        headingPath: "",
        content: "Completely unrelated text",
        tokenCount: 4,
        embeddingModel: "m",
        embedding: deterministic("Completely unrelated text", 8),
      },
    ]);
    const hits = await engine.search({ query: "SwiftUI", limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.noteId).toBe("n1");
  });

  it("reports hybrid search metadata", async () => {
    const { store, engine } = await makeRig();
    store.upsertNote(fakeNote("n1", "alpha.md", "Alpha"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "How to debug SwiftUI state loss",
        tokenCount: 8,
        embeddingModel: "m",
        embedding: deterministic("How to debug SwiftUI state loss", 8),
      },
    ]);

    const result = await engine.searchWithMeta({ query: "SwiftUI", limit: 5 });

    expect(result.hits[0]?.noteId).toBe("n1");
    expect(result.meta).toMatchObject({
      mode: "hybrid",
      fallbackReason: null,
      staleRatio: 0,
    });
    expect(result.meta.alpha).toBe(0.4);
  });

  it("groups chunks by note, returns up to 3 topChunks", async () => {
    const { store, engine } = await makeRig();
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    const chunks = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      noteId: "n1",
      ordinal: i,
      headingPath: "",
      content: `chunk ${i} keyword`,
      tokenCount: 4,
      embeddingModel: "m",
      embedding: deterministic(`chunk ${i} keyword`, 8),
    }));
    await store.setChunks("n1", chunks);
    const hits = await engine.search({ query: "keyword", limit: 5 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.topChunks.length).toBeLessThanOrEqual(3);
  });

  it("alpha rises when staleRatio is high", async () => {
    const { store, mock, reg, roles } = await makeRig();
    let observed = 0;
    const orig = store.searchHybrid.bind(store);
    store.searchHybrid = async (args) => {
      observed = args.alpha;
      return orig(args);
    };
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "x",
        tokenCount: 1,
        embeddingModel: "m",
        embedding: deterministic("x", 8),
      },
    ]);
    const engine2 = new SearchEngine({
      registry: reg,
      roles,
      store,
      getStaleRatio: () => 0.8,
    });
    const result = await engine2.searchWithMeta({ query: "x", limit: 5 });
    expect(observed).toBeGreaterThan(0.4);
    expect(mock.calls.embed.length).toBeGreaterThan(0);
    expect(result.meta.mode).toBe("stale-biased");
    expect(result.meta.fallbackReason).toBeNull();
    expect(result.meta.staleRatio).toBe(0.8);
  });

  it("falls back to text search when embedding role is not configured", async () => {
    const { store, roles } = await makeRig();
    roles.setRoles([]);
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "cat content here",
        tokenCount: 3,
        embeddingModel: null,
        embedding: deterministic("zero", 8),
      },
    ]);
    const engine = new SearchEngine({
      registry: new ProviderRegistry({ factories: [], fetch: async () => new Response("{}") }),
      roles,
      store,
    });

    const result = await engine.searchWithMeta({ query: "cat", limit: 5 });

    expect(result.hits.map((h) => h.noteId)).toContain("n1");
    expect(result.meta.mode).toBe("bm25");
    expect(result.meta.fallbackReason).toBe("embedding-role-missing");
  });

  it("falls back to text search when embedding provider call fails", async () => {
    const { store, engine } = await makeRig({
      embed: async () => {
        throw new AetherError("PROVIDER_HTTP_ERROR", "provider unavailable");
      },
    });
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "cat content here",
        tokenCount: 3,
        embeddingModel: "m",
        embedding: deterministic("cat content here", 8),
      },
    ]);

    const result = await engine.searchWithMeta({ query: "cat", limit: 5 });

    expect(result.hits.map((h) => h.noteId)).toContain("n1");
    expect(result.meta.mode).toBe("bm25");
    expect(result.meta.fallbackReason).toBe("provider-error");
  });

  it("falls back to text search when embedding provider config is invalid", async () => {
    const { store, engine, reg } = await makeRig();
    reg.setConfigs([
      {
        id: "p",
        name: "p",
        baseUrl: "not-a-url",
        apiKeyRef: "k",
        defaultHeaders: {},
        enabled: true,
        createdAt: 0,
      },
    ]);
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    await store.setChunks("n1", [
      {
        id: "c1",
        noteId: "n1",
        ordinal: 0,
        headingPath: "",
        content: "cat content here",
        tokenCount: 3,
        embeddingModel: "m",
        embedding: deterministic("cat content here", 8),
      },
    ]);

    const result = await engine.searchWithMeta({ query: "cat", limit: 5 });

    expect(result.hits.map((h) => h.noteId)).toContain("n1");
    expect(result.meta.mode).toBe("bm25");
    expect(result.meta.fallbackReason).toBe("provider-error");
  });
});
