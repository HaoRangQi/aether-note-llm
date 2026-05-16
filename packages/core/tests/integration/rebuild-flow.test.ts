import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";
import { MockProvider } from "../../src/provider/mock-provider.js";

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
      bindings: [{ feature: "embedding", providerId: "p", modelName: "m", params: {} }],
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
    await expect(core.search({ query: "cat" })).rejects.toMatchObject({
      code: "BINDING_NOT_FOUND",
    });
  });
});
