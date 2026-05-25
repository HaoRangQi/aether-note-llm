import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeElement, notices } from "./fixtures/obsidian.js";
import { HubView } from "../src/views/hub-view.js";
import { AetherError, migrateSettings, type SearchHit, type SearchMeta } from "@aether/core";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("Hub answer cancellation", () => {
  beforeEach(() => {
    notices.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses an assistant icon for the Hub entry point", () => {
    const view = new HubView({ app: {} } as never, { core: {} } as never);

    expect(view.getIcon()).toBe("bot-message-square");
  });

  it("shows a privacy warning next to the Hub search box", async () => {
    const view = new HubView(
      {
        app: {
          setting: {
            open: vi.fn(),
            openTabById: vi.fn(),
          },
        },
      } as never,
      {
        app: {},
        core: {
          settings: { current: migrateSettings({}) },
          store: { allChunks: () => [] },
          inbox: { listItems: () => [] },
          canOpenImportFolder: () => false,
        },
      } as never,
    );

    await (
      view as unknown as {
        renderShell(): Promise<void>;
      }
    ).renderShell();

    expect((view.containerEl.children[1] as FakeElement).textContent).toContain(
      "包含私密内容、密钥或密码的 vault 请优先使用本地模型",
    );
  });

  it("does not render a stale answer when the cancelled request resolves", async () => {
    const answer = deferred<unknown>();
    const plugin = {
      core: {
        answerSearch: vi.fn(() => answer.promise),
      },
    };
    const view = new HubView({ app: {} } as never, plugin as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerPanel(root: FakeElement, query: string, search: unknown): void;
      }
    ).renderAnswerPanel(root, "query", { hits: [], meta: {} });

    const answerButton = findButton(root, "综合回答");
    expect(answerButton).toBeTruthy();

    const run = answerButton?.onclick?.();
    expect(plugin.core.answerSearch).toHaveBeenCalledTimes(1);
    expect(answerButton?.text).toBe("取消");

    await answerButton?.onclick?.();
    answer.resolve({
      answer: "This stale answer must not render",
      citations: [],
      contextTokenCount: 12,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: false,
      },
    });
    await run;

    expect(root.textContent).toContain("已取消 AI 调用");
    expect(root.textContent).not.toContain("This stale answer must not render");
    expect(answerButton?.text).toBe("综合回答");
  });

  it("shows configuration guidance when the answer role is not bound", async () => {
    const plugin = {
      core: {
        answerSearch: vi
          .fn()
          .mockRejectedValue(new AetherError("BINDING_NOT_FOUND", "answer role missing")),
      },
    };
    const view = new HubView({ app: {} } as never, plugin as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerPanel(root: FakeElement, query: string, search: unknown): void;
      }
    ).renderAnswerPanel(root, "query", { hits: [], meta: {} });

    const answerButton = findButton(root, "综合回答");
    await answerButton?.onclick?.();

    expect(plugin.core.answerSearch).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain(
      "综合回答 Role 尚未绑定 Provider / Model，请在 Settings → AI Roles 检查配置。",
    );
    expect(answerButton?.text).toBe("综合回答");
    expect(findButton(root, "复制回答 + 来源")).toBeUndefined();
    expect(findButton(root, "打开来源")).toBeUndefined();
  });

  it("shows a provider failure without rendering copy or source actions", async () => {
    const plugin = {
      core: {
        answerSearch: vi.fn().mockRejectedValue(new Error("provider timeout")),
      },
    };
    const view = new HubView({ app: {} } as never, plugin as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerPanel(root: FakeElement, query: string, search: unknown): void;
      }
    ).renderAnswerPanel(root, "query", { hits: [], meta: {} });

    const answerButton = findButton(root, "综合回答");
    await answerButton?.onclick?.();

    expect(plugin.core.answerSearch).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("综合回答失败：provider timeout");
    expect(answerButton?.text).toBe("综合回答");
    expect(findButton(root, "复制回答 + 来源")).toBeUndefined();
    expect(findButton(root, "打开来源")).toBeUndefined();
  });

  it("keeps answer text and citations visible when copy fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [1]",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: false,
        },
      ],
    });
    const before = root.textContent;

    await findButton(root, "复制回答 + 来源")?.onclick?.();

    expect(notices).toContainEqual({
      message: "复制失败，请检查剪贴板权限后重试。",
      timeoutMs: 5000,
    });
    expect(root.textContent).toBe(before);
    expect(root.textContent).toContain("Use stable identity. [1]");
    expect(root.textContent).toContain("SwiftUI state note");
    expect(root.textContent).toContain("Stable ids keep state aligned with rendered rows.");
    expect(root.textContent).toContain("本次使用约 42 个上下文 token。");
  });

  it("copies answer text with source metadata and evidence", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [1]",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          url: "https://example.com/swiftui-state",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: false,
        },
      ],
    });

    await findButton(root, "复制回答 + 来源")?.onclick?.();

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toBe(
      [
        "Use stable identity. [1]",
        "",
        "Sources:",
        "[1] SwiftUI state note",
        "Path: Aether Inbox/notes/swiftui.md",
        "Heading: Debugging",
        "URL: https://example.com/swiftui-state",
        "Excerpt: Stable ids keep state aligned with rendered rows.",
      ].join("\n"),
    );
    expect(notices).toContainEqual({
      message: "回答和来源已复制",
      timeoutMs: 2000,
    });
    expect(root.textContent).toContain("Use stable identity. [1]");
    expect(root.textContent).toContain("SwiftUI state note");
    expect(root.textContent).toContain("Stable ids keep state aligned with rendered rows.");
  });

  it("shows a truncated context warning when answer context is budget-limited", () => {
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [1]",
      contextTokenCount: 2048,
      contextTruncated: true,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: true,
        },
      ],
    });

    expect(root.textContent).toContain("本次使用约 2048 个上下文 token；部分片段已按预算截断。");
    expect(root.textContent).toContain("该片段已按上下文预算截断。");
    expect(root.textContent).toContain("Use stable identity. [1]");
    expect(root.textContent).toContain("SwiftUI state note");
  });

  it("shows an empty answer state without rendering copy or source actions", () => {
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "",
      contextTokenCount: 0,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: false,
      },
      citations: [],
    });

    expect(root.textContent).toContain("没有足够内容生成回答。");
    expect(findButton(root, "复制回答 + 来源")).toBeUndefined();
    expect(findButton(root, "打开来源")).toBeUndefined();
  });

  it("treats whitespace-only answers as empty without rendering copy or source actions", () => {
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "   \n\t  ",
      contextTokenCount: 12,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: false,
      },
      citations: [
        {
          index: 1,
          title: "Should not render",
          vaultPath: "Aether Inbox/notes/hidden.md",
          headingPath: "",
          excerpt: "Hidden excerpt.",
          truncated: false,
        },
      ],
    });

    expect(root.textContent).toContain("没有足够内容生成回答。");
    expect(root.textContent).not.toContain("Should not render");
    expect(findButton(root, "复制回答 + 来源")).toBeUndefined();
    expect(findButton(root, "打开来源")).toBeUndefined();
  });

  it("shows a review warning when the answer references a missing citation", () => {
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [3]",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [3],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: false,
        },
      ],
    });

    expect(root.textContent).toContain("回答引用了不存在的来源：[3]，请人工核对。");
    expect(root.textContent).toContain("Use stable identity. [3]");
    expect(root.textContent).toContain("SwiftUI state note");
  });

  it("shows a review warning when the answer omits citations despite available sources", () => {
    const view = new HubView({ app: {} } as never, { core: {} } as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity.",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: false,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: false,
        },
      ],
    });

    expect(root.textContent).toContain("回答没有引用任何来源，请人工核对后再采纳。");
    expect(root.textContent).toContain("Use stable identity.");
    expect(root.textContent).toContain("SwiftUI state note");
  });

  it("opens answer sources as vault notes or external bookmark URLs", async () => {
    const openLinkText = vi.fn();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const view = new HubView(
      { app: { workspace: { openLinkText } } } as never,
      { core: {}, hostAdapter: { openExternal } } as never,
    );
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [1] [2]",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: false,
        },
        {
          index: 2,
          title: "State article",
          vaultPath: "Aether Inbox/bookmarks/state.md",
          url: "https://example.com/state",
          headingPath: "",
          excerpt: "State article excerpt.",
          truncated: false,
        },
      ],
    });

    const openButtons = findButtons(root, "打开来源");
    expect(openButtons).toHaveLength(2);
    openButtons[0]?.onclick?.();
    await openButtons[1]?.onclick?.();

    expect(openLinkText).toHaveBeenCalledWith("Aether Inbox/notes/swiftui.md", "", false);
    expect(openExternal).toHaveBeenCalledWith("https://example.com/state");
  });

  it("keeps recent imports visible when opening a recent note fails", async () => {
    const openLinkText = vi.fn().mockRejectedValue(new Error("missing recent note"));
    const view = new HubView(
      { app: { workspace: { openLinkText } } } as never,
      {
        core: {
          now: () => 1_700_000_060_000,
          listRecentImportedMarkdown: vi.fn().mockResolvedValue([
            {
              path: "Aether Inbox/notes/swiftui.md",
              mtime: 1_700_000_000_000,
            },
          ]),
        },
      } as never,
    );
    const root = new FakeElement("root");

    await (
      view as unknown as {
        renderRecent(root: FakeElement, requestId: number): Promise<void>;
      }
    ).renderRecent(root, 0);
    const before = root.textContent;

    findClickable(root, "swiftui")?.onclick?.();
    await settleAsyncHandlers();

    expect(openLinkText).toHaveBeenCalledWith("Aether Inbox/notes/swiftui.md", "", false);
    expect(notices).toContainEqual({
      message: "无法打开来源笔记：missing recent note",
      timeoutMs: 5000,
    });
    expect(root.textContent).toBe(before);
    expect(root.textContent).toContain("Aether Inbox/notes/swiftui.md");
  });

  it("keeps search results visible when opening a vault result fails", async () => {
    const openLinkText = vi.fn().mockRejectedValue(new Error("missing search note"));
    const hit: SearchHit = {
      noteId: "note-1",
      vaultPath: "Aether Inbox/notes/swiftui.md",
      kind: "note",
      title: "SwiftUI state note",
      summary: "Stable identity summary",
      tags: [],
      url: null,
      topChunks: [
        {
          chunkId: "chunk-1",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          tokenCount: 12,
          score: 0.9,
        },
      ],
      score: 0.9,
    };
    const meta: SearchMeta = {
      mode: "bm25",
      alpha: 1,
      staleRatio: 0,
      fallbackReason: "embedding-role-missing",
    };
    const view = new HubView(
      { app: { workspace: { openLinkText } } } as never,
      {
        core: {
          searchWithMeta: vi.fn().mockResolvedValue({ hits: [hit], meta }),
        },
      } as never,
    );
    const root = new FakeElement("root");
    (view as unknown as { query: string }).query = "swiftui";

    await (
      view as unknown as {
        renderSearch(root: FakeElement, requestId: number): Promise<void>;
      }
    ).renderSearch(root, 0);
    const before = root.textContent;

    findClickable(root, "SwiftUI state note")?.onclick?.();
    await settleAsyncHandlers();

    expect(openLinkText).toHaveBeenCalledWith("Aether Inbox/notes/swiftui.md", "", false);
    expect(notices).toContainEqual({
      message: "无法打开来源笔记：missing search note",
      timeoutMs: 5000,
    });
    expect(root.textContent).toBe(before);
    expect(root.textContent).toContain("SwiftUI state note");
    expect(root.textContent).toContain("Stable ids keep state aligned with rendered rows.");
  });

  it("keeps answer sources visible when opening an external source fails", async () => {
    const openExternal = vi.fn().mockRejectedValue(new Error("blocked"));
    const view = new HubView(
      { app: { workspace: { openLinkText: vi.fn() } } } as never,
      { core: {}, hostAdapter: { openExternal } } as never,
    );
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [1]",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "State article",
          vaultPath: "Aether Inbox/bookmarks/state.md",
          url: "https://example.com/state",
          headingPath: "",
          excerpt: "State article excerpt.",
          truncated: false,
        },
      ],
    });
    const before = root.textContent;

    await findButton(root, "打开来源")?.onclick?.();

    expect(openExternal).toHaveBeenCalledWith("https://example.com/state");
    expect(notices).toContainEqual({
      message: "无法打开外部链接：blocked",
      timeoutMs: 5000,
    });
    expect(root.textContent).toBe(before);
    expect(root.textContent).toContain("Use stable identity. [1]");
    expect(root.textContent).toContain("State article");
  });

  it("keeps answer sources visible when opening a vault source fails", async () => {
    const openLinkText = vi.fn().mockRejectedValue(new Error("missing file"));
    const view = new HubView(
      { app: { workspace: { openLinkText } } } as never,
      { core: {}, hostAdapter: { openExternal: vi.fn() } } as never,
    );
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderAnswerBody(root: FakeElement, answer: unknown): void;
      }
    ).renderAnswerBody(root, {
      answer: "Use stable identity. [1]",
      contextTokenCount: 42,
      contextTruncated: false,
      citationCheck: {
        invalidIndexes: [],
        hasAnyReference: true,
      },
      citations: [
        {
          index: 1,
          title: "SwiftUI state note",
          vaultPath: "Aether Inbox/notes/swiftui.md",
          headingPath: "Debugging",
          excerpt: "Stable ids keep state aligned with rendered rows.",
          truncated: false,
        },
      ],
    });
    const before = root.textContent;

    await findButton(root, "打开来源")?.onclick?.();

    expect(openLinkText).toHaveBeenCalledWith("Aether Inbox/notes/swiftui.md", "", false);
    expect(notices).toContainEqual({
      message: "无法打开来源笔记：missing file",
      timeoutMs: 5000,
    });
    expect(root.textContent).toBe(before);
    expect(root.textContent).toContain("Use stable identity. [1]");
    expect(root.textContent).toContain("SwiftUI state note");
  });
});

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  if (root.tag === "button" && root.text === text) return root;
  for (const child of root.children) {
    const result = findButton(child, text);
    if (result) return result;
  }
  return undefined;
}

function findButtons(root: FakeElement, text: string): FakeElement[] {
  const matches = root.tag === "button" && root.text === text ? [root] : [];
  for (const child of root.children) {
    matches.push(...findButtons(child, text));
  }
  return matches;
}

function findClickable(root: FakeElement, text: string): FakeElement | undefined {
  if (root.onclick && root.textContent.includes(text)) return root;
  for (const child of root.children) {
    const result = findClickable(child, text);
    if (result) return result;
  }
  return undefined;
}

async function settleAsyncHandlers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
