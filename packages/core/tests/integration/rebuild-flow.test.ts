import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";
import { MockProvider } from "../../src/provider/mock-provider.js";
import type { RebuildProgress } from "../../src/types.js";

describe("rebuild flow", () => {
  it("indexes pre-existing markdown files in vault", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
        "notes/b.md": "---\naether_id: 01ID-B\ntitle: Dogs\n---\ndog content here",
      },
      now: () => 1_700_000_000_000,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();

    const mock = new MockProvider({ embedDim: 8 });
    core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
    await core.settings.save({
      ...core.settings.current,
      providers: [
        {
          id: "p",
          name: "Mock",
          baseUrl: "https://x",
          apiKeyRef: "k",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
      roles: core.settings.current.roles.map((r) =>
        r.id === "embedding" ? { ...r, providerId: "p", modelName: "m" } : r,
      ),
      apiKeys: { k: "secret" },
    });
    core.applySettings(core.settings.current);

    const r = await core.rebuildAll();
    expect(r.scanned).toBe(2);
    expect(r.indexed).toBe(2);

    const hits = await core.search({ query: "cat" });
    expect(hits.find((h) => h.title === "Cats")).toBeDefined();
  });

  it("indexes BM25-only when no embedding binding is configured", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
      },
      now: () => 1_700_000_000_000,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    const r = await core.rebuildAll();
    expect(r.indexed).toBe(1);
    const hits = await core.search({ query: "cat" });
    expect(hits.find((h) => h.title === "Cats")).toBeDefined();
  });

  it("emits progress while rebuilding", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
        "notes/b.md": "---\naether_id: 01ID-B\ntitle: Dogs\n---\ndog content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();

    const progress: RebuildProgress[] = [];
    const r = await core.rebuildAll({ onProgress: (p) => progress.push(p) });

    expect(r.scanned).toBe(2);
    expect(progress[0]?.phase).toBe("scanning");
    expect(progress.some((p) => p.phase === "indexing" && p.total === 2)).toBe(true);
    expect(progress.at(-1)).toMatchObject({ phase: "saving", scanned: 2, indexed: 2 });
  });

  it("aggregates failures without aborting the rebuild", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/good.md": "---\naether_id: 01ID-G\ntitle: Good\n---\ngood content here",
        "notes/bad.md": "---\naether_id: 01ID-B\ntitle: Bad\n---\nbad content here",
      },
      now: () => 1_700_000_000_000,
    });
    const originalRead = host.readFile.bind(host);
    host.readFile = async (path: string) => {
      if (path === "notes/bad.md") throw new Error("read failed");
      return originalRead(path);
    };
    const core = new AetherCore(host);
    await core.init();

    const progress: RebuildProgress[] = [];
    const r = await core.rebuildAll({ onProgress: (p) => progress.push(p) });

    expect(r.scanned).toBe(2);
    expect(r.indexed).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.failures).toEqual([{ path: "notes/bad.md", message: "read failed" }]);
    expect(progress.at(-1)).toMatchObject({ phase: "saving", failed: 1 });
  });

  it("can cancel a rebuild before indexing the current file", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
        "notes/b.md": "---\naether_id: 01ID-B\ntitle: Dogs\n---\ndog content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();

    const ac = new AbortController();
    const progress: RebuildProgress[] = [];
    const r = await core.rebuildAll({
      signal: ac.signal,
      onProgress: (p) => {
        progress.push(p);
        if (p.phase === "indexing" && p.scanned === 1) ac.abort();
      },
    });

    expect(r.cancelled).toBe(true);
    expect(r.scanned).toBe(0);
    expect(r.indexed).toBe(0);
    expect(progress.at(-1)).toMatchObject({ phase: "saving", scanned: 0, indexed: 0 });
    const hits = await core.search({ query: "cat" });
    expect(hits.find((h) => h.title === "Cats")).toBeUndefined();
  });

  it("passes rebuild abort signal to embedding requests", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    const mock = new MockProvider({ embedDim: 8 });
    core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
    await core.settings.save({
      ...core.settings.current,
      providers: [
        {
          id: "p",
          name: "Mock",
          baseUrl: "https://x",
          apiKeyRef: "k",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
      roles: core.settings.current.roles.map((r) =>
        r.id === "embedding" ? { ...r, providerId: "p", modelName: "m" } : r,
      ),
      apiKeys: { k: "secret" },
    });
    core.applySettings(core.settings.current);

    const ac = new AbortController();
    await core.rebuildAll({ signal: ac.signal });

    expect(mock.calls.embed.length).toBeGreaterThanOrEqual(2);
    expect(mock.calls.embed.every((call) => call.signal === ac.signal)).toBe(true);
  });

  it("serializes rebuild and refresh index mutations", async () => {
    let releaseEmbed!: () => void;
    let markBlockingEmbedStarted!: () => void;
    const blockingEmbedStarted = new Promise<void>((resolve) => {
      markBlockingEmbedStarted = resolve;
    });
    let blockingEmbedSeen = false;
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    const mock = new MockProvider({
      embed: async (req) => {
        const dim = 8;
        if (!req.inputs.includes("dim probe") && !blockingEmbedSeen) {
          blockingEmbedSeen = true;
          markBlockingEmbedStarted();
          await new Promise<void>((resolve) => {
            releaseEmbed = resolve;
          });
        }
        return {
          vectors: req.inputs.map(() => new Array<number>(dim).fill(0.5)),
          model: req.model,
          dim,
        };
      },
    });
    core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
    await core.settings.save({
      ...core.settings.current,
      providers: [
        {
          id: "p",
          name: "Mock",
          baseUrl: "https://x",
          apiKeyRef: "k",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
      roles: core.settings.current.roles.map((r) =>
        r.id === "embedding" ? { ...r, providerId: "p", modelName: "m" } : r,
      ),
      apiKeys: { k: "secret" },
    });
    core.applySettings(core.settings.current);

    const rebuild = core.rebuildAll();
    await blockingEmbedStarted;
    const refresh = core.refreshChangedIndex();
    let refreshSettled = false;
    refresh.then(() => {
      refreshSettled = true;
    });
    await Promise.resolve();

    expect(refreshSettled).toBe(false);
    releaseEmbed();
    await rebuild;
    await refresh;
    expect(core.store.allNotes()).toHaveLength(1);
    expect(core.store.allChunks().length).toBeGreaterThan(0);
  });

  it("detects stale indexed notes and refreshes changed content", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    const mock = new MockProvider({ embedDim: 8 });
    core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
    await core.settings.save({
      ...core.settings.current,
      providers: [
        {
          id: "p",
          name: "Mock",
          baseUrl: "https://x",
          apiKeyRef: "k",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
      roles: core.settings.current.roles.map((r) =>
        r.id === "embedding" ? { ...r, providerId: "p", modelName: "m" } : r,
      ),
      apiKeys: { k: "secret" },
    });
    core.applySettings(core.settings.current);
    await core.rebuildAll();

    await host.writeFile(
      "notes/a.md",
      "---\naether_id: 01ID-A\ntitle: Cats\n---\nlynx content here",
    );

    const health = await core.checkIndexHealth();
    expect(health.indexedNotes).toBe(1);
    expect(health.freshNotes).toHaveLength(0);
    expect(health.staleNotes).toEqual([
      expect.objectContaining({ noteId: "01ID-A", vaultPath: "notes/a.md", title: "Cats" }),
    ]);
    expect(health.missingFiles).toEqual([]);
    expect((await core.searchWithMeta({ query: "cat" })).meta).toMatchObject({
      mode: "stale-biased",
      staleRatio: 1,
    });

    const refresh = await core.refreshChangedIndex();
    expect(refresh.staleNotes).toBe(1);
    expect(refresh.reindexedNotes).toEqual([
      expect.objectContaining({ noteId: "01ID-A", vaultPath: "notes/a.md" }),
    ]);

    const oldHits = await core.search({ query: "cat" });
    expect(
      oldHits.find((h) => h.topChunks.some((chunk) => chunk.content.includes("cat content here"))),
    ).toBeUndefined();
    const newHits = await core.search({ query: "lynx" });
    expect(newHits.find((h) => h.noteId === "01ID-A")).toBeDefined();
    expect((await core.searchWithMeta({ query: "lynx" })).meta).toMatchObject({
      mode: "hybrid",
      staleRatio: 0,
    });
  });

  it("continues refresh when one indexed file cannot be read", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/good.md": "---\naether_id: 01ID-G\ntitle: Good\n---\nold good content",
        "notes/bad.md": "---\naether_id: 01ID-B\ntitle: Bad\n---\nbad content",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    await core.rebuildAll();

    await host.writeFile(
      "notes/good.md",
      "---\naether_id: 01ID-G\ntitle: Good\n---\nnew good content",
    );
    const originalRead = host.readFile.bind(host);
    host.readFile = async (path: string) => {
      if (path === "notes/bad.md") throw new Error("permission denied");
      return originalRead(path);
    };

    const refresh = await core.refreshChangedIndex();

    expect(refresh.reindexedNotes).toEqual([
      expect.objectContaining({ noteId: "01ID-G", vaultPath: "notes/good.md" }),
    ]);
    expect(refresh.failures).toEqual([
      { path: "notes/bad.md", noteId: "01ID-B", message: "permission denied" },
    ]);
    expect(
      (await core.search({ query: "new good" })).find((h) => h.noteId === "01ID-G"),
    ).toBeDefined();
  });

  it("rolls back stale note metadata when reindex fails so refresh can retry", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\nold cat content",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    const mock = new MockProvider({ embedDim: 8 });
    core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
    await core.settings.save({
      ...core.settings.current,
      providers: [
        {
          id: "p",
          name: "Mock",
          baseUrl: "https://x",
          apiKeyRef: "k",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
      roles: core.settings.current.roles.map((r) =>
        r.id === "embedding" ? { ...r, providerId: "p", modelName: "m" } : r,
      ),
      apiKeys: { k: "secret" },
    });
    core.applySettings(core.settings.current);
    await core.rebuildAll();
    const before = core.store.getNote("01ID-A");
    expect(before?.contentHash).toBeDefined();

    await host.writeFile(
      "notes/a.md",
      "---\naether_id: 01ID-A\ntitle: Cats\n---\nnew lynx content",
    );
    let failEmbedding = true;
    const failingMock = new MockProvider({
      embed: async (req) => {
        if (failEmbedding && !req.inputs.includes("dim probe")) throw new Error("embedding down");
        const dim = 8;
        return {
          vectors: req.inputs.map(() => new Array<number>(dim).fill(0.5)),
          model: req.model,
          dim,
        };
      },
    });
    core.registry.registerFactory({ kind: "openai-compatible", create: () => failingMock });
    core.applySettings(core.settings.current);

    const failedRefresh = await core.refreshChangedIndex();
    expect(failedRefresh.failures).toEqual([
      { path: "notes/a.md", noteId: "01ID-A", message: "embedding down" },
    ]);
    expect(core.store.getNote("01ID-A")?.contentHash).toBe(before?.contentHash);
    expect((await core.checkIndexHealth()).staleNotes).toEqual([
      expect.objectContaining({ noteId: "01ID-A" }),
    ]);

    failEmbedding = false;
    const recoveredRefresh = await core.refreshChangedIndex();
    expect(recoveredRefresh.failures).toEqual([]);
    expect(recoveredRefresh.reindexedNotes).toEqual([
      expect.objectContaining({ noteId: "01ID-A", vaultPath: "notes/a.md" }),
    ]);
    expect(
      (await core.search({ query: "new lynx" })).find((h) => h.noteId === "01ID-A"),
    ).toBeDefined();
  });

  it("removes indexed notes and chunks when markdown files are deleted", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    await core.rebuildAll();

    expect(core.store.allNotes()).toHaveLength(1);
    expect(core.store.allChunks().length).toBeGreaterThan(0);

    await host.deleteFile("notes/a.md");

    const health = await core.checkIndexHealth();
    expect(health.missingFiles).toEqual([
      expect.objectContaining({ noteId: "01ID-A", vaultPath: "notes/a.md", currentHash: null }),
    ]);

    const refresh = await core.refreshChangedIndex();
    expect(refresh.missingFiles).toBe(1);
    expect(refresh.deletedNotes).toEqual([
      expect.objectContaining({ noteId: "01ID-A", vaultPath: "notes/a.md" }),
    ]);
    expect(core.store.allNotes()).toEqual([]);
    expect(core.store.allChunks()).toEqual([]);
    expect(await core.search({ query: "cat" })).toEqual([]);
  });

  it("full rebuild removes indexed notes whose files were deleted", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
        "notes/b.md": "---\naether_id: 01ID-B\ntitle: Dogs\n---\ndog content here",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    await core.rebuildAll();
    await host.deleteFile("notes/a.md");

    const result = await core.rebuildAll();

    expect(result.indexed).toBe(1);
    expect(core.store.getNote("01ID-A")).toBeUndefined();
    expect(core.store.getNote("01ID-B")).toBeDefined();
    expect(await core.search({ query: "cat" })).toEqual([]);
    expect((await core.search({ query: "dog" })).find((h) => h.noteId === "01ID-B")).toBeDefined();
  });

  it("full rebuild removes old note ids when the same path changes aether_id", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-OLD\ntitle: Old\n---\nlegacyalpha content",
      },
      now: () => 1_700_000_000_000,
    });
    const core = new AetherCore(host);
    await core.init();
    await core.rebuildAll();

    await host.writeFile(
      "notes/a.md",
      "---\naether_id: 01ID-NEW\ntitle: New\n---\nfreshbeta content",
    );
    await core.rebuildAll();

    expect(core.store.getNote("01ID-OLD")).toBeUndefined();
    expect(core.store.getNote("01ID-NEW")).toBeDefined();
    expect(core.store.allChunks().every((chunk) => chunk.noteId !== "01ID-OLD")).toBe(true);
    expect(await core.search({ query: "legacyalpha" })).toEqual([]);
    expect(
      (await core.search({ query: "freshbeta" })).find((h) => h.noteId === "01ID-NEW"),
    ).toBeDefined();
  });
});
