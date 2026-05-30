import { describe, expect, it } from "vitest";
import { ImportPipeline, type ImportEvent } from "../../../src/import/pipeline.js";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { InboxStore } from "../../../src/import/inbox-store.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import { MarkdownConnector } from "../../../src/connectors/markdown-connector.js";
import { UrlListConnector } from "../../../src/connectors/url-list-connector.js";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { RoleRegistry } from "../../../src/roles/role-registry.js";
import { BUILTIN_ROLE_SEEDS, seedToRole } from "../../../src/roles/default-roles.js";
import { AetherError, type ImportSource, type BuiltInRoleId } from "../../../src/index.js";
import type { SourceConnector } from "../../../src/connectors/connector.js";
import type { ImportCategory } from "../../../src/types.js";

function bindAll(roles: RoleRegistry, ids: BuiltInRoleId[]): void {
  const list = BUILTIN_ROLE_SEEDS.filter((s) => ids.includes(s.id)).map((s) => {
    const r = seedToRole(s, 0);
    r.providerId = "p";
    r.modelName = "m";
    return r;
  });
  roles.setRoles(list);
}

function bindPrivateImportRoles(roles: RoleRegistry): void {
  const list = BUILTIN_ROLE_SEEDS.filter((s) =>
    (["embedding", "inbox_metadata"] as BuiltInRoleId[]).includes(s.id),
  ).map((seed) => {
    const role = seedToRole(seed, 0);
    role.providerId = "public";
    role.modelName = "public-model";
    role.privateProviderId = "trusted";
    role.privateModelName = "private-model";
    return role;
  });
  roles.setRoles(list);
}

async function makeRig(
  options: {
    connectors?: SourceConnector[];
    maxItemsPerBatch?: number;
    chatChunks?: ConstructorParameters<typeof MockProvider>[0]["chatChunks"];
  } = {},
) {
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
    chatChunks:
      options.chatChunks ??
      (() => [{ delta: '{"title":"AI","tags":["t"],"summary":"S"}', finishReason: "stop" }]),
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
  const roles = new RoleRegistry();
  bindAll(roles, ["embedding", "inbox_metadata"]);
  const pipeline = new ImportPipeline({
    host,
    registry: reg,
    roles,
    store,
    inbox,
    connectors: options.connectors ?? [new MarkdownConnector()],
    maxItemsPerBatch: options.maxItemsPerBatch,
  });
  return { host, store, inbox, pipeline, provider, reg, roles };
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

  it("uses AI proposal title when role bound", async () => {
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

  it("stores a valid AI-proposed category on inbox items", async () => {
    const { pipeline, inbox, provider } = await makeRig({
      chatChunks: () => [
        {
          delta:
            '{"title":"Prompt Pack","tags":["prompt"],"summary":"S","categoryId":"ai-prompts"}',
          finishReason: "stop",
        },
      ],
    });
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Prompt library" },
    };
    await collect(pipeline.run(src));
    expect(inbox.listItems()[0]?.proposedCategoryId).toBe("ai-prompts");
    expect(provider.calls.chat[0]?.messages[0]?.content).toContain("ai-prompts");
    expect(provider.calls.chat[0]?.messages[0]?.content).toContain("教程");
  });

  it("falls back to other when AI category is invalid", async () => {
    const { pipeline, inbox } = await makeRig({
      chatChunks: () => [
        {
          delta: '{"title":"Unknown","tags":[],"summary":"","categoryId":"misc"}',
          finishReason: "stop",
        },
      ],
    });
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Unknown" },
    };
    await collect(pipeline.run(src));
    expect(inbox.listItems()[0]?.proposedCategoryId).toBe("other");
  });

  it("emits error event when no connector matches", async () => {
    const { pipeline } = await makeRig();
    const src: ImportSource = {
      kind: "file",
      label: "x",
      payload: { type: "url-list", urls: ["https://x"] },
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
    const { host, store, inbox, provider, reg, roles } = await makeRig();
    const p = new ImportPipeline({
      host,
      registry: reg,
      roles,
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
    expect(events).toContainEqual({
      type: "batch-truncated",
      batchId: "id-1",
      imported: 2,
      cap: 2,
    });
    expect(events.at(-1)).toEqual({ type: "batch-finished", batchId: "id-1", total: 2 });
    void provider;
  });

  it("keeps url-only bookmarks on the cheap path without AI metadata or embedding", async () => {
    const { pipeline, inbox, provider } = await makeRig({ connectors: [new UrlListConnector()] });
    const src: ImportSource = {
      kind: "paste",
      label: "urls",
      payload: { type: "url-list", urls: ["https://example.com/docs/a"] },
    };

    await collect(pipeline.run(src));

    expect(provider.calls.chat).toHaveLength(0);
    expect(provider.calls.embed).toHaveLength(0);
    expect(inbox.listItems()[0]).toMatchObject({
      kind: "bookmark",
      url: "https://example.com/docs/a",
      proposedTitle: "a",
      proposedSummary: "",
    });
  });

  it("continues a truncated url import by skipping pending normalized URLs", async () => {
    const { pipeline, inbox } = await makeRig({
      connectors: [new UrlListConnector()],
      maxItemsPerBatch: 2,
    });
    const src: ImportSource = {
      kind: "paste",
      label: "urls",
      payload: {
        type: "url-list",
        urls: [
          "https://example.com/1?utm_source=newsletter",
          "https://example.com/2",
          "https://example.com/3",
          "https://example.com/4",
          "https://example.com/5",
        ],
      },
    };

    const first = await collect(pipeline.run(src));
    const second = await collect(pipeline.run(src));

    expect(first.filter((e) => e.type === "item-added")).toHaveLength(2);
    expect(second.filter((e) => e.type === "item-added")).toHaveLength(2);
    expect(inbox.listItems().map((item) => item.url)).toEqual([
      "https://example.com/1?utm_source=newsletter",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
    ]);
    expect(second).toContainEqual({
      type: "batch-truncated",
      batchId: "id-4",
      imported: 2,
      cap: 2,
    });
  });

  it("skips url imports that already exist as indexed bookmark notes", async () => {
    const { pipeline, store, inbox } = await makeRig({ connectors: [new UrlListConnector()] });
    store.upsertNote({
      id: "note-1",
      vaultPath: "Aether Inbox/bookmarks/2026/05/example.md",
      kind: "bookmark",
      title: "Existing",
      summary: null,
      tags: [],
      url: "https://example.com/a",
      source: "import",
      sourceMeta: {},
      createdAt: 1,
      updatedAt: 1,
      contentHash: "hash",
      indexState: "fresh",
    });
    const src: ImportSource = {
      kind: "paste",
      label: "urls",
      payload: {
        type: "url-list",
        urls: ["https://example.com/a?utm_source=newsletter", "https://example.com/b"],
      },
    };

    const events = await collect(pipeline.run(src));

    expect(events.filter((e) => e.type === "item-added")).toHaveLength(1);
    expect(inbox.listItems().map((item) => item.url)).toEqual(["https://example.com/b"]);
  });

  it("aborts import preparation before creating inbox items", async () => {
    const { pipeline, inbox } = await makeRig({ connectors: [new UrlListConnector()] });
    const ac = new AbortController();
    ac.abort();
    const src: ImportSource = {
      kind: "paste",
      label: "urls",
      payload: { type: "url-list", urls: ["https://example.com/a"] },
    };

    await expect(collect(pipeline.run(src, { signal: ac.signal }))).rejects.toBeInstanceOf(
      AetherError,
    );
    expect(inbox.listItems()).toEqual([]);
  });

  it("passes AbortSignal through metadata and embedding preparation calls", async () => {
    const { pipeline, provider } = await makeRig();
    const ac = new AbortController();
    const src: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello world" },
    };

    await collect(pipeline.run(src, { signal: ac.signal }));

    expect(provider.calls.chat[0]?.signal).toBe(ac.signal);
    expect(provider.calls.embed[0]?.signal).toBe(ac.signal);
  });

  it("keeps private import local when no private route is available", async () => {
    const { pipeline, inbox, provider } = await makeRig();
    const src: ImportSource = {
      kind: "file",
      label: "Private/secret.md",
      payload: { type: "markdown-file", path: "Private/secret.md", content: "top secret" },
    };

    await collect(pipeline.run(src, { privacyTarget: "private" }));

    expect(provider.calls.chat).toHaveLength(0);
    expect(provider.calls.embed).toHaveLength(0);
    expect(inbox.listItems()[0]).toMatchObject({
      proposedTitle: "secret",
      duplicateOf: null,
      status: "pending",
    });
  });

  it("routes private import metadata and duplicate detection through the trusted private route", async () => {
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
    const publicProvider = new MockProvider({
      chatChunks: () => [{ delta: "public should not run", finishReason: "stop" }],
    });
    const trustedProvider = new MockProvider({
      chatChunks: () => [
        {
          delta: '{"title":"Private AI","tags":["secret"],"summary":"Private summary"}',
          finishReason: "stop",
        },
      ],
      embedDim: 8,
    });
    const reg = new ProviderRegistry({
      factories: [
        {
          kind: "openai-compatible",
          create: ({ id }) => (id === "trusted" ? trustedProvider : publicProvider),
        },
      ],
      fetch: async () => new Response("{}"),
    });
    reg.setConfigs([
      {
        id: "public",
        name: "Public",
        baseUrl: "https://public.example/v1",
        apiKeyRef: "k-public",
        defaultHeaders: {},
        enabled: true,
        createdAt: 0,
      },
      {
        id: "trusted",
        name: "Trusted",
        baseUrl: "https://trusted.example/v1",
        apiKeyRef: "k-trusted",
        defaultHeaders: {},
        enabled: true,
        createdAt: 0,
      },
    ]);
    reg.setApiKeys({ "k-public": "public-secret", "k-trusted": "trusted-secret" });
    const roles = new RoleRegistry();
    bindPrivateImportRoles(roles);
    const pipeline = new ImportPipeline({
      host,
      registry: reg,
      roles,
      store,
      inbox,
      connectors: [new MarkdownConnector()],
      getImportCategories: (): ImportCategory[] => [
        { id: "other", label: "Other", folderName: "Other", keywords: [] },
      ],
      resolvePrivateRoute: () => ({ providerId: "trusted", modelName: "private-model" }),
    });
    const src: ImportSource = {
      kind: "file",
      label: "Private/secret.md",
      payload: { type: "markdown-file", path: "Private/secret.md", content: "top secret" },
    };

    await collect(pipeline.run(src, { privacyTarget: "private" }));

    expect(publicProvider.calls.chat).toHaveLength(0);
    expect(publicProvider.calls.embed).toHaveLength(0);
    expect(trustedProvider.calls.chat).toHaveLength(1);
    expect(trustedProvider.calls.chat[0]?.model).toBe("private-model");
    expect(trustedProvider.calls.embed).toHaveLength(1);
    expect(trustedProvider.calls.embed[0]?.model).toBe("private-model");
    expect(inbox.listItems()[0]).toMatchObject({
      proposedTitle: "Private AI",
      proposedTags: ["secret"],
      proposedSummary: "Private summary",
      duplicateOf: null,
      status: "pending",
    });
  });
});
