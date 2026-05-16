import { describe, expect, it } from "vitest";
import { ImportPipeline, type ImportEvent } from "../../../src/import/pipeline.js";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { InboxStore } from "../../../src/import/inbox-store.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import { MarkdownConnector } from "../../../src/connectors/markdown-connector.js";
import { BookmarksJsonConnector } from "../../../src/connectors/bookmarks-json-connector.js";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import type { ImportSource } from "../../../src/types.js";

async function makeRig() {
  const host = new InMemoryHostAdapter({
    now: () => 5_000_000,
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const store = new OramaIndexStore({ embeddingDim: 8 });
  await store.init();
  const inbox = new InboxStore(host);
  const provider = new MockProvider({
    chatChunks: () => [
      { delta: '{"title":"AI","tags":["t"],"summary":"S"}', finishReason: "stop" },
    ],
    embedDim: 8,
  });
  const reg = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
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
  reg.setApiKeys({ k: "s" });
  reg.setBindings([
    { feature: "embedding", providerId: "p", modelName: "m", params: {} },
    { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
  ]);
  const pipeline = new ImportPipeline({
    host,
    registry: reg,
    store,
    inbox,
    connectors: [new MarkdownConnector()],
  });
  return { host, store, inbox, pipeline, provider };
}

async function collect(iter: AsyncIterable<ImportEvent>): Promise<ImportEvent[]> {
  const out: ImportEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("ImportPipeline", () => {
  it("emits batch-started, item-added*, batch-finished", async () => {
    const { pipeline } = await makeRig();
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello world" },
    };
    const events = await collect(pipeline.run(src));
    expect(events[0]?.type).toBe("batch-started");
    expect(events.filter((e) => e.type === "item-added")).toHaveLength(1);
    expect(events[events.length - 1]?.type).toBe("batch-finished");
  });

  it("uses AI proposal title when binding present", async () => {
    const { pipeline, inbox } = await makeRig();
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello" },
    };
    await collect(pipeline.run(src));
    const items = inbox.listItems();
    expect(items[0]?.proposedTitle).toBe("AI");
  });

  it("emits error event when no connector matches", async () => {
    const { pipeline } = await makeRig();
    const src: ImportSource = {
      kind: "file",
      label: "x",
      payload: { type: "url-list", urls: ["https://x"] }, // no UrlListConnector wired
    };
    const events = await collect(pipeline.run(src));
    expect(events[0]?.type).toBe("error");
  });

  it("persists inbox after batch", async () => {
    const { pipeline, host } = await makeRig();
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello" },
    };
    await collect(pipeline.run(src));
    expect(await host.readData("inbox.json")).not.toBeNull();
  });

  it("respects maxItemsPerBatch cap", async () => {
    const { host, store, inbox, provider } = await makeRig();
    const reg = new ProviderRegistry({
      factories: [{ kind: "openai-compatible", create: () => provider }],
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
    reg.setApiKeys({ k: "s" });
    reg.setBindings([
      { feature: "embedding", providerId: "p", modelName: "m", params: {} },
      { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
    ]);
    const p = new ImportPipeline({
      host,
      registry: reg,
      store,
      inbox,
      connectors: [new MarkdownConnector()],
      maxItemsPerBatch: 2,
    });
    const src: ImportSource = {
      kind: "file",
      label: "batch",
      payload: {
        type: "markdown-files",
        files: Array.from({ length: 5 }, (_, i) => ({ path: `${i}.md`, content: `n${i}` })),
      },
    };
    const events = await collect(p.run(src));
    expect(events.filter((e) => e.type === "item-added")).toHaveLength(2);
  });

  it("preserves kind=bookmark when connector emits a bookmark candidate", async () => {
    const { host, store, inbox, provider } = await makeRig();
    const reg = new ProviderRegistry({
      factories: [{ kind: "openai-compatible", create: () => provider }],
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
    reg.setApiKeys({ k: "s" });
    reg.setBindings([
      { feature: "embedding", providerId: "p", modelName: "m", params: {} },
      { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
    ]);
    const p = new ImportPipeline({
      host,
      registry: reg,
      store,
      inbox,
      connectors: [new BookmarksJsonConnector()],
    });
    const src: ImportSource = {
      kind: "file",
      label: "chrome.json",
      payload: {
        type: "bookmarks-json",
        raw: JSON.stringify({
          roots: {
            bookmark_bar: {
              type: "folder",
              name: "bar",
              children: [{ type: "url", url: "https://x.com", name: "X" }],
            },
          },
        }),
      },
    };
    const events = await collect(p.run(src));
    const added = events.filter(
      (e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added",
    );
    expect(added).toHaveLength(1);
    expect(added[0]?.item.kind).toBe("bookmark");
    expect(added[0]?.item.url).toBe("https://x.com");
  });

  it("runs without an embedding binding (BM25-only)", async () => {
    const { host, store, inbox, provider } = await makeRig();
    const reg = new ProviderRegistry({
      factories: [{ kind: "openai-compatible", create: () => provider }],
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
    reg.setApiKeys({ k: "s" });
    // Only metadata bound; no embedding → pipeline must skip dup detection.
    reg.setBindings([{ feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} }]);
    const p = new ImportPipeline({
      host,
      registry: reg,
      store,
      inbox,
      connectors: [new MarkdownConnector()],
    });
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello" },
    };
    const events = await collect(p.run(src));
    const added = events.filter(
      (e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added",
    );
    expect(added).toHaveLength(1);
    expect(added[0]?.item.duplicateOf).toBeNull();
  });
});
