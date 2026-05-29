import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeElement, notices, openedModals } from "./fixtures/obsidian.js";
import { PluginDataStore } from "../src/plugin-data-store.js";
import { listJobHistory } from "../src/job-history.js";
import { openPendingImportItems } from "../src/modals/import-modal.js";
import { migrateSettings } from "@aether/core";
import type { InboxItem, Note } from "@aether/core";

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

class DataHost {
  data: unknown = {};

  async loadData(): Promise<unknown> {
    return structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
  }
}

describe("pending import cancellation", () => {
  let body: FakeElement;

  beforeEach(() => {
    body = new FakeElement("body");
    notices.length = 0;
    openedModals.length = 0;
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    vi.stubGlobal("document", { body });
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
      setTimeout: vi.fn((cb: () => void) => {
        cb();
        return 1;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps unprocessed pending items when cancelling from the pending imports entry", async () => {
    const firstWrite = deferred<Note>();
    const openLinkText = vi.fn().mockRejectedValue(new Error("missing imported note"));
    const app = { workspace: { openLinkText } };
    const items = [makeInboxItem("item-1", 2_000), makeInboxItem("item-2", 1_000)];
    const host = new DataHost();
    const plugin = {
      app,
      dataStore: new PluginDataStore(host),
      openHubAndRefresh: vi.fn(),
      core: {
        settings: { current: migrateSettings({}) },
        inbox: {
          listItems: vi.fn(() => items.filter((item) => item.status === "pending")),
          getItem: vi.fn((id: string) => items.find((item) => item.id === id) ?? null),
        },
        store: {
          getNote: vi.fn(() => null),
        },
        updateInboxItemDraft: vi.fn(),
        approveInboxItem: vi.fn(async (id: string) => {
          if (id === "item-1") {
            const note = await firstWrite.promise;
            items[0] = { ...items[0]!, status: "approved", decidedAt: Date.now() };
            return note;
          }
          items[1] = { ...items[1]!, status: "approved", decidedAt: Date.now() };
          return makeNote("item-2");
        }),
        mergeInboxItem: vi.fn(),
        discardInboxItem: vi.fn(async (id: string) => {
          const index = items.findIndex((item) => item.id === id);
          if (index >= 0) items[index] = { ...items[index]!, status: "discarded" };
        }),
      },
    };

    expect(openPendingImportItems(app as never, plugin as never)).toBe(true);
    const preview = openedModals[0] as unknown as { importSelected(): Promise<void> };
    const write = preview.importSelected();

    await Promise.resolve();
    findButton(body, "取消")?.onclick?.();
    firstWrite.resolve(makeNote("item-1"));
    await write;

    expect(plugin.core.approveInboxItem).toHaveBeenCalledTimes(1);
    expect(plugin.core.approveInboxItem).toHaveBeenCalledWith("item-1", { target: "public" });
    expect(plugin.core.discardInboxItem).not.toHaveBeenCalled();
    expect(items[0]?.status).toBe("approved");
    expect(items[1]?.status).toBe("pending");
    expect(plugin.openHubAndRefresh).toHaveBeenCalledTimes(1);
    const resultModal = openedModals.at(-1);
    expect(resultModal?.contentEl.textContent).toContain("导入完成");

    const beforeOpenFailure = resultModal?.contentEl.textContent;
    const openBtn = findButton(resultModal?.contentEl ?? new FakeElement("empty"), "打开");
    expect(openBtn).toBeTruthy();
    openBtn?.onclick?.();
    await settleAsyncHandlers();

    expect(openLinkText).toHaveBeenCalledWith("Aether Inbox/notes/item-1.md", "", false);
    expect(notices).toContainEqual({
      message: "无法打开导入笔记：missing imported note",
      timeoutMs: 5000,
    });
    expect(resultModal?.contentEl.textContent).toBe(beforeOpenFailure);
    expect(resultModal?.contentEl.textContent).toContain("Aether Inbox/notes/item-1.md");

    const [job] = await listJobHistory(plugin as never);
    expect(job).toMatchObject({
      kind: "import-write",
      status: "cancelled",
      summary: {
        selected: 2,
        processed: 1,
        imported: 1,
        merged: 0,
        failed: 0,
        cancelled: true,
      },
    });
  });
});

function makeInboxItem(id: string, createdAt: number): InboxItem {
  return {
    id,
    batchId: "batch-1",
    sourceKind: "paste",
    sourceRef: `${id}.md`,
    proposedTitle: `Title ${id}`,
    proposedTags: ["inbox"],
    proposedSummary: `Summary ${id}`,
    proposedCategoryId: "other",
    content: `Content ${id}`,
    kind: "note",
    url: null,
    duplicateOf: null,
    status: "pending",
    createdAt,
    decidedAt: null,
  };
}

function makeNote(id: string): Note {
  return {
    id: `note-${id}`,
    vaultPath: `Aether Inbox/notes/${id}.md`,
    kind: "note",
    title: `Title ${id}`,
    summary: null,
    tags: [],
    url: null,
    source: "import",
    sourceMeta: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    contentHash: id,
    indexState: "fresh",
  };
}

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  if (root.tag === "button" && root.text === text) return root;
  for (const child of root.children) {
    const result = findButton(child, text);
    if (result) return result;
  }
  return undefined;
}

async function settleAsyncHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
