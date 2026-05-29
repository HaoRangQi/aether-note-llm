import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";
import { MockProvider } from "../../src/provider/mock-provider.js";

async function configureMockProvider(
  core: AetherCore,
  provider: MockProvider,
  extraSettings: Partial<typeof core.settings.current> = {},
): Promise<void> {
  core.registry.registerFactory({ kind: "openai-compatible", create: () => provider });
  await core.settings.save({
    ...core.settings.current,
    ...extraSettings,
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
    roles: core.settings.current.roles.map((r) => ({
      ...r,
      providerId: "p",
      modelName: "m",
    })),
    apiKeys: { k: "secret" },
  });
  core.applySettings(core.settings.current);
}

describe("AetherCore", () => {
  it("init loads defaults when no settings present", async () => {
    const host = new InMemoryHostAdapter({
      now: () => 1,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    expect(core.settings.current.providers).toEqual([]);
    expect(core.settings.current.ui.alpha).toBe(0.4);
  });

  it("indexExistingVaultFile reads markdown + indexes", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID\ntitle: My Note\n---\nbody about cats",
      },
      now: () => 100,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    const note = await core.indexExistingVaultFile("notes/a.md");
    expect(note?.id).toBe("01ID");
    expect(note?.title).toBe("My Note");
  });

  it("rebuildAll scans configured scope", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/a.md": "# A\nbody",
        "Aether Inbox/notes/b.md": "# B\nbody",
        "Other/c.md": "# C\nbody",
      },
      now: () => 100,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    await core.settings.save({
      ...core.settings.current,
      ui: { ...core.settings.current.ui, scanScope: "aether-inbox-only" },
    });
    const r = await core.rebuildAll();
    expect(r.indexed).toBe(2);
  });

  it("limits search and answer context to the configured scan scope", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/in.md": "# In\nsharedterm inside scope",
        "Other/out.md": "# Out\nsharedterm outside scope",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: (req) => [
        {
          delta: req.messages[0]?.content.includes("Other/out.md")
            ? "scope leak"
            : "scoped answer [1]",
          finishReason: "stop",
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    await core.rebuildAll();
    expect((await core.search({ query: "sharedterm" })).map((hit) => hit.vaultPath).sort()).toEqual(
      ["Aether Inbox/notes/in.md", "Other/out.md"],
    );

    await core.settings.save({
      ...core.settings.current,
      ui: { ...core.settings.current.ui, scanScope: "aether-inbox-only" },
    });
    core.applySettings(core.settings.current);

    const scopedHits = await core.search({ query: "sharedterm" });
    expect(scopedHits.map((hit) => hit.vaultPath)).toEqual(["Aether Inbox/notes/in.md"]);

    const answer = await core.answerSearch({ query: "sharedterm" });
    expect(answer.answer).toBe("scoped answer [1]");
    expect(answer.citations.map((citation) => citation.vaultPath)).toEqual([
      "Aether Inbox/notes/in.md",
    ]);
    expect(provider.calls.chat.at(-1)?.messages[0]?.content).not.toContain("Other/out.md");

    const rebuilt = await core.rebuildAll();
    expect(rebuilt.indexed).toBe(1);
    expect(core.store.allNotes().map((note) => note.vaultPath)).toEqual([
      "Aether Inbox/notes/in.md",
    ]);
  });

  it("isolates private/public search hits by privacyScope and keeps private search local without route", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Private/keep.md": "# Keep\nsharedterm private scope",
        "Private Draft/leak.md": "# Leak\nsharedterm should stay public",
        "Public/keep.md": "# Public\nsharedterm public scope",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider();
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.indexExistingVaultFile("Private/keep.md");
    await core.indexExistingVaultFile("Private Draft/leak.md");
    await core.indexExistingVaultFile("Public/keep.md");

    const privateResult = await core.searchWithMeta({
      query: "sharedterm",
      privacyScope: "private",
      limit: 10,
    });
    expect(privateResult.meta.mode).toBe("bm25");
    expect(privateResult.meta.fallbackReason).toBe("provider-error");
    expect(privateResult.hits.map((hit) => hit.vaultPath)).toEqual(["Private/keep.md"]);

    const publicResult = await core.searchWithMeta({
      query: "sharedterm",
      privacyScope: "public",
      limit: 10,
    });
    const publicPaths = publicResult.hits.map((hit) => hit.vaultPath);
    expect(publicPaths).toEqual(
      expect.arrayContaining(["Private Draft/leak.md", "Public/keep.md"]),
    );
    expect(publicPaths).not.toContain("Private/keep.md");
  });

  it("routes private editor role calls via trusted provider fallback and blocks when no private route", async () => {
    const host = new InMemoryHostAdapter({
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "private summary", finishReason: "stop" }],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    await expect(
      core.runRole(
        "summarize",
        { selection: "secret", maxSentences: 3 },
        undefined,
        "Private/a.md",
      ),
    ).rejects.toMatchObject({ code: "BINDING_NOT_FOUND" });
    expect(provider.calls.chat).toHaveLength(0);

    await core.settings.save({
      ...core.settings.current,
      providers: core.settings.current.providers.map((p) =>
        p.id === "p" ? { ...p, trustedForPrivate: true } : p,
      ),
    });
    core.applySettings(core.settings.current);

    await expect(
      core.runRole(
        "summarize",
        { selection: "secret", maxSentences: 3 },
        undefined,
        "Private/a.md",
      ),
    ).resolves.toBe("private summary");
    expect(provider.calls.chat).toHaveLength(1);
  });

  it("prefers role-level private binding when provider is trusted", async () => {
    const host = new InMemoryHostAdapter({
      now: () => Date.UTC(2026, 4, 24),
    });
    const publicProvider = new MockProvider({
      chatChunks: () => [{ delta: "public summary", finishReason: "stop" }],
    });
    const trustedProvider = new MockProvider({
      chatChunks: () => [{ delta: "private summary", finishReason: "stop" }],
    });
    const core = new AetherCore(host);
    await core.init();
    core.registry.registerFactory({
      kind: "openai-compatible",
      create: ({ id }) => (id === "trusted" ? trustedProvider : publicProvider),
    });
    await core.settings.save({
      ...core.settings.current,
      providers: [
        {
          id: "public",
          name: "Public",
          baseUrl: "https://public.example/v1",
          apiKeyRef: "k-public",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
          trustedForPrivate: false,
        },
        {
          id: "trusted",
          name: "Trusted",
          baseUrl: "https://trusted.example/v1",
          apiKeyRef: "k-trusted",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
          trustedForPrivate: true,
        },
      ],
      roles: core.settings.current.roles.map((role) =>
        role.id === "summarize"
          ? {
              ...role,
              providerId: "public",
              modelName: "public-model",
              privateProviderId: "trusted",
              privateModelName: "private-model",
            }
          : { ...role, providerId: "public", modelName: "public-model" },
      ),
      apiKeys: {
        "k-public": "secret-public",
        "k-trusted": "secret-trusted",
      },
    });
    core.applySettings(core.settings.current);

    await expect(
      core.runRole(
        "summarize",
        { selection: "secret", maxSentences: 3 },
        undefined,
        "Private/a.md",
      ),
    ).resolves.toBe("private summary");
    expect(trustedProvider.calls.chat).toHaveLength(1);
    expect(trustedProvider.calls.chat[0]?.model).toBe("private-model");
    expect(publicProvider.calls.chat).toHaveLength(0);
  });

  it("writes approved private imports into private inbox folder", async () => {
    const host = new InMemoryHostAdapter({
      now: () => Date.UTC(2026, 4, 24),
      newId: (() => {
        const ids = ["note-1"];
        let n = 0;
        return () => ids[n++] ?? `id-${n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    core.inbox.createBatch({ id: "batch-1", sourceLabel: "paste", totalItems: 1 });
    core.inbox.addItem({
      id: "item-1",
      batchId: "batch-1",
      sourceKind: "paste",
      sourceRef: "paste",
      proposedTitle: "Private Note",
      proposedTags: ["private"],
      proposedSummary: "",
      proposedCategoryId: "life",
      content: "secret content",
      kind: "note",
      url: null,
      duplicateOf: null,
      status: "pending",
      createdAt: Date.UTC(2026, 4, 24),
      decidedAt: null,
    });

    const note = await core.approveInboxItem("item-1", { target: "private" });

    expect(note.vaultPath).toContain("Aether Private Inbox/生活/2026/05/");
    expect(core.settings.current.privacy.importLastTarget).toBe("private");
    const raw = await host.readFile(note.vaultPath);
    expect(raw).toContain("secret content");
    expect(raw).toContain("aether_category: life");
    expect(raw).toContain("aether_category_label: 生活");
  });

  it("approves imports into selected category folders and avoids path collisions", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/教程/2026/05/item-1-title.md": "existing",
      },
      now: () => Date.UTC(2026, 4, 24),
      newId: (() => {
        const ids = ["note-1"];
        let n = 0;
        return () => ids[n++] ?? `id-${n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    core.inbox.createBatch({ id: "batch-1", sourceLabel: "paste", totalItems: 1 });
    core.inbox.addItem({
      id: "item-1",
      batchId: "batch-1",
      sourceKind: "paste",
      sourceRef: "paste",
      proposedTitle: "Title",
      proposedTags: ["guide"],
      proposedSummary: "summary",
      proposedCategoryId: "tutorial",
      content: "guide content",
      kind: "note",
      url: null,
      duplicateOf: null,
      status: "pending",
      createdAt: Date.UTC(2026, 4, 24),
      decidedAt: null,
    });

    const note = await core.approveInboxItem("item-1");

    expect(note.vaultPath).toBe("Aether Inbox/教程/2026/05/item-1-title-2.md");
    const raw = await host.readFile(note.vaultPath);
    expect(raw).toContain("aether_category: tutorial");
    expect(raw).toContain("aether_category_label: 教程");
    await expect(host.readFile("Aether Inbox/教程/2026/05/item-1-title.md")).resolves.toBe(
      "existing",
    );
  });

  it("previews and applies organization moves by directory and path month without sending body", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/2026/05/prompt.md":
          "---\naether_id: note-1\naether_kind: note\ntitle: Prompt Library\ntags:\n  - prompt\naether_summary: AI prompt examples\n---\nSECRET BODY MUST STAY LOCAL",
        "Aether Inbox/notes/2026/04/old.md":
          "---\naether_id: note-2\ntitle: Old Note\ntags: []\naether_summary: old\n---\nold body",
        "Other/2026/05/out.md": "---\naether_id: note-3\ntitle: Out\ntags: []\n---\nout body",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: (req) => [
        {
          delta: req.messages[0]?.content.includes("Prompt Library")
            ? '{"title":"Prompt Library","tags":["prompt"],"summary":"AI prompt examples","categoryId":"ai-prompts"}'
            : '{"title":"Other","tags":[],"summary":"","categoryId":"other"}',
          finishReason: "stop",
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.rebuildAll();

    const plan = await core.previewOrganizeImports({
      rootFolder: "Aether Inbox",
      fromMonth: "2026/05",
      toMonth: "2026/05",
    });

    expect(plan.items.map((item) => item.currentPath)).toEqual([
      "Aether Inbox/notes/2026/05/prompt.md",
    ]);
    expect(plan.items[0]).toMatchObject({
      categoryId: "ai-prompts",
      targetPath: "Aether Inbox/AI 提示词/2026/05/prompt.md",
    });
    expect(provider.calls.chat[0]?.messages[0]?.content).toContain("Prompt Library");
    expect(provider.calls.chat[0]?.messages[0]?.content).not.toContain("SECRET BODY");

    const result = await core.applyOrganizeImports(plan);

    expect(result.moved).toHaveLength(1);
    await expect(host.readFile("Aether Inbox/AI 提示词/2026/05/prompt.md")).resolves.toContain(
      "aether_category: ai-prompts",
    );
    await expect(host.readFile("Aether Inbox/notes/2026/05/prompt.md")).rejects.toThrow();
    expect(core.store.getNote("note-1")?.vaultPath).toBe(
      "Aether Inbox/AI 提示词/2026/05/prompt.md",
    );
    const hits = await core.search({ query: "Prompt Library", limit: 10 });
    expect(hits.map((hit) => hit.vaultPath)).toContain("Aether Inbox/AI 提示词/2026/05/prompt.md");
    expect(hits.map((hit) => hit.vaultPath)).not.toContain("Aether Inbox/notes/2026/05/prompt.md");
  });

  it("rolls back organization target files and index entries when deleting the original fails", async () => {
    class DeleteFailHostAdapter extends InMemoryHostAdapter {
      async deleteFile(path: string): Promise<void> {
        if (path === "Aether Inbox/notes/2026/05/prompt.md") {
          throw new Error("delete failed");
        }
        await super.deleteFile(path);
      }
    }

    const currentPath = "Aether Inbox/notes/2026/05/prompt.md";
    const targetPath = "Aether Inbox/AI 提示词/2026/05/prompt.md";
    const host = new DeleteFailHostAdapter({
      files: {
        [currentPath]:
          "---\naether_id: note-1\naether_kind: note\ntitle: Prompt Library\ntags:\n  - prompt\naether_summary: AI prompt examples\n---\nRollback prompt body",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: () => [
        {
          delta: '{"categoryId":"ai-prompts"}',
          finishReason: "stop",
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.rebuildAll();

    const plan = await core.previewOrganizeImports({
      rootFolder: "Aether Inbox",
      fromMonth: "2026/05",
      toMonth: "2026/05",
    });

    expect(plan.items[0]?.targetPath).toBe(targetPath);
    const result = await core.applyOrganizeImports(plan);

    expect(result.moved).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain("delete failed");
    await expect(host.readFile(currentPath)).resolves.toContain("Rollback prompt body");
    await expect(host.readFile(targetPath)).rejects.toThrow();
    expect(core.store.getNote("note-1")?.vaultPath).toBe(currentPath);
    const hits = await core.search({ query: "Rollback", limit: 10 });
    expect(hits.map((hit) => hit.vaultPath)).toContain(currentPath);
    expect(hits.map((hit) => hit.vaultPath)).not.toContain(targetPath);
  });

  it("persists token usage across core init", async () => {
    const host = new InMemoryHostAdapter({ now: () => Date.UTC(2026, 4, 24) });
    const provider = new MockProvider({
      chatChunks: () => [
        {
          delta: "summary",
          finishReason: "stop",
          usage: { promptTokens: 11, completionTokens: 7 },
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    await core.runRole("summarize", { selection: "hello", maxSentences: 3 });

    expect(await host.readData("usage.json")).not.toBeNull();
    const next = new AetherCore(host);
    next.registry.registerFactory({ kind: "openai-compatible", create: () => provider });
    await next.init();
    expect(next.usage.snapshot().monthTotal).toEqual({
      promptTokens: 11,
      completionTokens: 7,
    });
  });

  it("records critique role usage as its own feature", async () => {
    const host = new InMemoryHostAdapter({ now: () => Date.UTC(2026, 4, 24) });
    const provider = new MockProvider({
      chatChunks: () => [
        {
          delta: "critique",
          finishReason: "stop",
          usage: { promptTokens: 13, completionTokens: 5 },
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    await core.runRole("critique", { selection: "hello" });

    expect(core.usage.snapshot().perFeature.critique).toEqual({
      promptTokens: 13,
      completionTokens: 5,
    });
    expect(core.usage.snapshot().perFeature.chat).toBeUndefined();
  });

  it("answers from filtered search hits with citations and records answer usage", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/swiftui.md": "# SwiftUI\nState is lost when identity changes in a List row.",
        "Aether Inbox/bookmarks/swiftui.md":
          "---\naether_kind: bookmark\naether_url: https://example.com/swiftui\n---\nSwiftUI bookmark state lost reference",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: (req) => [
        {
          delta: req.messages[0]?.content.includes("State is lost")
            ? "身份变化会导致状态丢失。[1]"
            : "missing context",
          finishReason: "stop",
          usage: { promptTokens: 17, completionTokens: 9 },
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.indexExistingVaultFile("notes/swiftui.md");
    await core.indexExistingVaultFile("Aether Inbox/bookmarks/swiftui.md");

    const answer = await core.answerSearch({
      query: "state",
      filters: { kind: "note" },
      maxContextChunks: 2,
    });

    expect(answer.answer).toBe("身份变化会导致状态丢失。[1]");
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({
      index: 1,
      vaultPath: "notes/swiftui.md",
      title: "SwiftUI",
    });
    expect(answer.citationCheck).toEqual({
      referencedIndexes: [1],
      invalidIndexes: [],
      unusedIndexes: [],
      hasAnyReference: true,
    });
    expect(answer.citations[0]?.url).toBeNull();
    expect(answer.search.hits.every((hit) => hit.kind === "note")).toBe(true);
    expect(provider.calls.chat.at(-1)?.messages[0]?.content).toContain("[1] SwiftUI");
    expect(core.usage.snapshot().perFeature.answer).toEqual({
      promptTokens: 17,
      completionTokens: 9,
    });
  });

  it("does not call answer role when search has no hits", async () => {
    const host = new InMemoryHostAdapter({
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider();
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    const answer = await core.answerSearch({ query: "anything" });

    expect(answer.answer).toBe("");
    expect(answer.citations).toEqual([]);
    expect(answer.citationCheck).toEqual({
      referencedIndexes: [],
      invalidIndexes: [],
      unusedIndexes: [],
      hasAnyReference: false,
    });
    expect(provider.calls.chat).toEqual([]);
  });

  it("reports invalid answer citations for review", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/rag.md": "# RAG\nCitations should map to retrieved chunks.",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "需要检查引用。[9]", finishReason: "stop" }],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.indexExistingVaultFile("notes/rag.md");

    const answer = await core.answerSearch({ query: "citations" });

    expect(answer.citations.map((c) => c.index)).toEqual([1]);
    expect(answer.citationCheck).toEqual({
      referencedIndexes: [9],
      invalidIndexes: [9],
      unusedIndexes: [1],
      hasAnyReference: true,
    });
  });

  it("caps answer context by approximate token budget", async () => {
    const host = new InMemoryHostAdapter({ now: () => Date.UTC(2026, 4, 24) });
    const provider = new MockProvider({
      chatChunks: (req) => [
        {
          delta:
            req.messages[0]?.content.includes("second source") === false
              ? "只使用预算内片段。[1]"
              : "unexpected second source",
          finishReason: "stop",
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    const answer = await core.answerSearch({
      query: "budget",
      maxContextChunks: 3,
      maxContextTokens: 5,
      search: {
        meta: { mode: "bm25", alpha: 0.4, staleRatio: 0, fallbackReason: null },
        hits: [
          {
            noteId: "n1",
            vaultPath: "notes/long.md",
            kind: "note",
            title: "Long",
            summary: null,
            tags: [],
            url: null,
            score: 1,
            topChunks: [
              {
                chunkId: "c1",
                headingPath: "",
                excerpt: "first source",
                content: "first source ".repeat(20),
                tokenCount: 20,
                score: 1,
              },
              {
                chunkId: "c2",
                headingPath: "",
                excerpt: "second source",
                content: "second source should not enter the prompt",
                tokenCount: 4,
                score: 0.9,
              },
            ],
          },
        ],
      },
    });

    const prompt = provider.calls.chat.at(-1)?.messages[0]?.content ?? "";
    expect(prompt).toContain("[1] Long");
    expect(prompt).not.toContain("second source");
    expect(answer.contextTokenCount).toBe(5);
    expect(answer.contextTruncated).toBe(true);
    expect(answer.citations).toEqual([
      expect.objectContaining({ index: 1, tokenCount: 5, truncated: true }),
    ]);
    expect(answer.answer).toBe("只使用预算内片段。[1]");
  });

  it("solves a problem from historical context and records solve usage", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/swiftui.md": "# SwiftUI\nState is lost when identity changes in a List row.",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: (req) => [
        {
          delta: req.messages[0]?.content.includes("State is lost")
            ? JSON.stringify({
                summary: "列表身份变化会导致状态丢失。[1]",
                confidence: "high",
                evidenceStatus: "supported",
                likelyCauses: ["List row identity changed [1]"],
                steps: ["Stabilize row identity [1]", "Keep state outside recreated row [1]"],
                risks: ["Confirm the actual identity source before refactor"],
                missingInfo: [],
              })
            : "missing context",
          finishReason: "stop",
          usage: { promptTokens: 19, completionTokens: 11 },
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.indexExistingVaultFile("notes/swiftui.md");

    const solved = await core.solveProblem({ question: "SwiftUI 状态丢失怎么办？" });

    expect(solved.solution).toMatchObject({
      summary: "列表身份变化会导致状态丢失。[1]",
      confidence: "high",
      evidenceStatus: "supported",
      steps: ["Stabilize row identity [1]", "Keep state outside recreated row [1]"],
    });
    expect(solved.citations).toHaveLength(1);
    expect(solved.citationCheck.invalidIndexes).toEqual([]);
    expect(provider.calls.chat.at(-1)?.messages[0]?.content).toContain("[1] SwiftUI");
    expect(core.usage.snapshot().perFeature.solve).toEqual({
      promptTokens: 19,
      completionTokens: 11,
    });
  });

  it("returns low-confidence generic advice without calling solve when context is empty", async () => {
    const host = new InMemoryHostAdapter({ now: () => Date.UTC(2026, 4, 24) });
    const provider = new MockProvider();
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);

    const solved = await core.solveProblem({ question: "怎么整理新项目？" });

    expect(solved.solution).toMatchObject({
      confidence: "low",
      evidenceStatus: "missing",
    });
    expect(solved.solution.steps.length).toBeGreaterThan(0);
    expect(solved.citations).toEqual([]);
    expect(provider.calls.chat).toEqual([]);
  });

  it("does not call remote solve for private scope without a trusted route", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Private/debug.md": "# Debug\nSecret incident root cause.",
      },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "should not be called", finishReason: "stop" }],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
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
          trustedForPrivate: false,
        },
      ],
    });
    core.applySettings(core.settings.current);
    await core.indexExistingVaultFile("Private/debug.md");

    const solved = await core.solveProblem({
      question: "secret root cause",
      privacyScope: "private",
    });

    expect(solved.solution.evidenceStatus).toBe("missing");
    expect(solved.blockedReason).toBe("private-route-missing");
    expect(provider.calls.chat).toEqual([]);
  });

  it("saves an editable experience card to the configured folder and indexes it", async () => {
    const host = new InMemoryHostAdapter({
      now: () => Date.UTC(2026, 4, 24),
      newId: (() => {
        const ids = ["exp-note-1", "private-exp-note-1", "exp-note-2"];
        let n = 0;
        return () => ids[n++] ?? `id-${n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    await core.settings.save({
      ...core.settings.current,
      ui: {
        ...core.settings.current.ui,
        experienceFolder: "Experience",
        privateExperienceFolder: "Private Experience",
      },
    });

    const note = await core.saveExperienceCard({
      title: "SwiftUI state loss",
      problem: "SwiftUI 状态丢失怎么办？",
      summary: "稳定 List row identity。",
      steps: ["检查 id 来源", "把状态提升到稳定 owner"],
      tags: ["swiftui", "debug"],
      confidence: "medium",
      evidenceStatus: "partial",
      citations: [
        {
          index: 1,
          noteId: "n1",
          vaultPath: "notes/swiftui.md",
          title: "SwiftUI",
          chunkId: "c1",
          headingPath: "",
          excerpt: "State is lost",
          url: null,
          tokenCount: 5,
          truncated: false,
        },
      ],
      privacyScope: "public",
    });

    expect(note.vaultPath).toBe("Experience/2026/05/exp-note-1-swiftui-state-loss.md");
    const raw = await host.readFile(note.vaultPath);
    expect(raw).toContain("aether_experience: true");
    expect(raw).toContain("aether_problem: SwiftUI 状态丢失怎么办？");
    expect(raw).toContain("aether_solution_confidence: medium");
    expect(raw).toContain("aether_evidence_status: partial");
    expect(raw).toContain("## 推荐步骤");
    expect(
      (await core.search({ query: "stable owner", limit: 3 })).map((hit) => hit.vaultPath),
    ).toContain(note.vaultPath);

    const privateNote = await core.saveExperienceCard({
      title: "Private incident",
      problem: "私密事故怎么处理？",
      summary: "secret stable owner",
      steps: ["只在私密范围复盘"],
      tags: ["incident"],
      confidence: "low",
      evidenceStatus: "missing",
      citations: [],
      privacyScope: "private",
    });

    expect(privateNote.vaultPath).toBe("Private Experience/2026/05/private-ex-private-incident.md");
    expect(
      (await core.search({ query: "secret stable owner", privacyScope: "public" })).map(
        (hit) => hit.vaultPath,
      ),
    ).not.toContain(privateNote.vaultPath);
    expect(
      (await core.search({ query: "secret stable owner", privacyScope: "private" })).map(
        (hit) => hit.vaultPath,
      ),
    ).toContain(privateNote.vaultPath);

    const allScopePrivateCitation = await core.saveExperienceCard({
      title: "All private source",
      problem: "all 范围引用私密来源时写到哪里？",
      summary: "private cited evidence",
      steps: ["保存到私密经验目录"],
      tags: ["privacy"],
      confidence: "medium",
      evidenceStatus: "partial",
      citations: [
        {
          index: 1,
          noteId: "n-private",
          vaultPath: "Private/source.md",
          title: "Private source",
          chunkId: "c-private",
          headingPath: "",
          excerpt: "Private evidence",
          url: null,
          tokenCount: 4,
          truncated: false,
        },
      ],
      privacyScope: "all",
    });

    expect(allScopePrivateCitation.vaultPath).toBe(
      "Private Experience/2026/05/exp-note-2-all-private-source.md",
    );
  });

  it("merges an inbox item into an existing note and refreshes the index", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/existing.md":
          "---\naether_id: note-1\ntitle: Existing\n---\nOriginal content about search.",
      },
      now: () => Date.UTC(2026, 4, 24),
      newId: (() => {
        const ids = ["batch-1", "item-1"];
        let n = 0;
        return () => ids[n++] ?? `id-${n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    await core.indexExistingVaultFile("notes/existing.md");
    core.inbox.createBatch({ id: "batch-1", sourceLabel: "paste", totalItems: 1 });
    core.inbox.addItem({
      id: "item-1",
      batchId: "batch-1",
      sourceKind: "paste",
      sourceRef: "paste",
      proposedTitle: "Duplicate",
      proposedTags: [],
      proposedSummary: "",
      proposedCategoryId: "other",
      content: "Merged content about import decisions.",
      kind: "note",
      url: null,
      duplicateOf: "note-1",
      status: "pending",
      createdAt: Date.UTC(2026, 4, 24),
      decidedAt: null,
    });

    const updated = await core.mergeInboxItem("item-1", "note-1");

    expect(updated.id).toBe("note-1");
    expect(core.inbox.getItem("item-1")?.status).toBe("merged");
    await expect(host.readFile("notes/existing.md")).resolves.toContain(
      "Merged content about import decisions.",
    );
    const results = await core.search({ query: "import decisions" });
    expect(results[0]?.noteId).toBe("note-1");
  });

  it("rolls back a newly approved file when reindexing fails", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "seed.md": "# Seed\nseed content",
      },
      now: () => Date.UTC(2026, 4, 24),
      newId: (() => {
        const ids = ["note-1"];
        let n = 0;
        return () => ids[n++] ?? `id-${n}`;
      })(),
    });
    const provider = new MockProvider({
      embed: async (req) =>
        req.inputs.some((input) => input.includes("cannot be reindexed"))
          ? { vectors: [[1, 2]], model: "m", dim: 2 }
          : { vectors: req.inputs.map(() => new Array(8).fill(0)), model: "m", dim: 8 },
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.indexExistingVaultFile("seed.md");
    core.inbox.createBatch({ id: "batch-1", sourceLabel: "paste", totalItems: 1 });
    core.inbox.addItem({
      id: "item-1",
      batchId: "batch-1",
      sourceKind: "paste",
      sourceRef: "paste",
      proposedTitle: "Rollback",
      proposedTags: [],
      proposedSummary: "",
      proposedCategoryId: "other",
      content: "content that cannot be reindexed",
      kind: "note",
      url: null,
      duplicateOf: null,
      status: "pending",
      createdAt: Date.UTC(2026, 4, 24),
      decidedAt: null,
    });

    await expect(core.approveInboxItem("item-1")).rejects.toMatchObject({
      code: "EMBED_DIM_MISMATCH",
    });

    expect(core.inbox.getItem("item-1")?.status).toBe("pending");
    expect(core.store.getNote("note-1")).toBeUndefined();
    await expect(host.readFile("Aether Inbox/notes/2026/05/item-1-rollback.md")).rejects.toThrow(
      "ENOENT",
    );
  });

  it("rolls back merged file content when reindexing fails", async () => {
    const original = "---\naether_id: note-1\ntitle: Existing\n---\nOriginal content about search.";
    const host = new InMemoryHostAdapter({
      files: { "notes/existing.md": original, "seed.md": "# Seed\nseed content" },
      now: () => Date.UTC(2026, 4, 24),
    });
    const provider = new MockProvider({
      embed: async (req) =>
        req.inputs.some((input) => input.includes("Merged content"))
          ? { vectors: [[1, 2]], model: "m", dim: 2 }
          : { vectors: req.inputs.map(() => new Array(8).fill(0)), model: "m", dim: 8 },
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider);
    await core.indexExistingVaultFile("seed.md");
    await core.indexExistingVaultFile("notes/existing.md");
    const beforeChunks = core.store.chunksForNote("note-1");
    core.inbox.createBatch({ id: "batch-1", sourceLabel: "paste", totalItems: 1 });
    core.inbox.addItem({
      id: "item-1",
      batchId: "batch-1",
      sourceKind: "paste",
      sourceRef: "paste",
      proposedTitle: "Duplicate",
      proposedTags: [],
      proposedSummary: "",
      proposedCategoryId: "other",
      content: "Merged content should roll back.",
      kind: "note",
      url: null,
      duplicateOf: "note-1",
      status: "pending",
      createdAt: Date.UTC(2026, 4, 24),
      decidedAt: null,
    });

    await expect(core.mergeInboxItem("item-1", "note-1")).rejects.toMatchObject({
      code: "EMBED_DIM_MISMATCH",
    });

    expect(core.inbox.getItem("item-1")?.status).toBe("pending");
    await expect(host.readFile("notes/existing.md")).resolves.toBe(original);
    expect(core.store.getNote("note-1")?.contentHash).toBeDefined();
    expect(core.store.chunksForNote("note-1")).toEqual(beforeChunks);
  });

  it("notifies once when token usage crosses the monthly warning threshold", async () => {
    const host = new InMemoryHostAdapter({ now: () => Date.UTC(2026, 4, 24) });
    const provider = new MockProvider({
      chatChunks: () => [
        {
          delta: "summary",
          finishReason: "stop",
          usage: { promptTokens: 6, completionTokens: 0 },
        },
      ],
    });
    const core = new AetherCore(host);
    await core.init();
    await configureMockProvider(core, provider, {
      budgets: { ...core.settings.current.budgets, monthlyTokenWarn: 10 },
    });

    await core.runRole("summarize", { selection: "one", maxSentences: 3 });
    expect(host.notices).toEqual([]);

    await core.runRole("summarize", { selection: "two", maxSentences: 3 });
    expect(host.notices).toHaveLength(1);
    expect(host.notices[0]).toMatchObject({
      message: "Monthly token budget warning reached: 12/10 tokens used.",
      options: { level: "warn", timeoutMs: 0 },
    });

    await core.runRole("summarize", { selection: "three", maxSentences: 3 });
    expect(host.notices).toHaveLength(1);
  });
});
