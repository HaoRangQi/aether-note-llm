import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateSettings, type InboxItem, type ImportOrganizePlan } from "@aether/core";
import { openPendingImportItems } from "../src/modals/import-modal.js";
import { OrganizeImportsModal } from "../src/modals/organize-imports-modal.js";
import { AetherSettingsTab } from "../src/settings-tab.js";
import { PluginDataStore } from "../src/plugin-data-store.js";
import { FakeElement, openedModals, notices } from "./fixtures/obsidian.js";

describe("import categories UI", () => {
  let body: FakeElement;

  beforeEach(() => {
    body = new FakeElement("body");
    openedModals.length = 0;
    notices.length = 0;
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

  it("renders category selection in import preview and syncs category drafts", async () => {
    const item = makeInboxItem();
    const plugin = makeImportPlugin(item);

    expect(openPendingImportItems({} as never, plugin as never)).toBe(true);
    const modal = openedModals[0]!;
    expect(modal.contentEl.textContent).toContain("分类");
    expect(modal.contentEl.textContent).toContain("目标路径：Aether Inbox/生活/2026/05/");

    const select = modal.contentEl.querySelector(".aether-import-preview-category-select");
    expect(select).toBeTruthy();
    select!.value = "history";
    select!.onchange?.();

    const preview = openedModals[0] as unknown as { importSelected(): Promise<void> };
    await preview.importSelected();

    expect(plugin.core.updateInboxItemDraft).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ proposedCategoryId: "history" }),
    );
  });

  it("edits and restores import categories in settings", async () => {
    let current = migrateSettings({});
    const plugin = {
      core: {
        settings: {
          get current() {
            return current;
          },
          save: vi.fn(async (next: typeof current) => {
            current = structuredClone(next);
          }),
        },
        applySettings: vi.fn((next: typeof current) => {
          current = structuredClone(next);
        }),
        canOpenImportFolder: vi.fn(() => false),
      },
    };
    const tab = new AetherSettingsTab({} as never, plugin as never);
    (tab as unknown as { currentSection: string }).currentSection = "advanced";

    tab.display();
    expect((tab.containerEl as unknown as FakeElement).textContent).toContain("导入分类");
    const manager = (tab.containerEl as unknown as FakeElement).querySelector(
      ".aether-category-manager",
    );
    expect(manager?.tag).toBe("details");
    expect(manager?.open).toBe(true);
    expect(manager?.querySelector(".aether-category-manager__summary")?.tag).toBe("summary");
    expect(manager?.querySelector(".aether-category-manager__table")).toBeTruthy();
    expect(manager?.querySelector(".aether-category-row")).toBeTruthy();
    expect(manager?.querySelector(".aether-category-row__fallback-badge")?.textContent).toContain(
      "兜底",
    );

    const add = findButton(tab.containerEl as unknown as FakeElement, "新增分类");
    add?.onclick?.();
    await settleAsyncHandlers();
    expect(current.importing.categories.some((category) => category.id.startsWith("custom-"))).toBe(
      true,
    );

    const restore = findButton(tab.containerEl as unknown as FakeElement, "恢复默认分类");
    restore?.onclick?.();
    await settleAsyncHandlers();
    expect(current.importing.categories.map((category) => category.id)).toEqual([
      "tutorial",
      "ai-prompts",
      "life",
      "history",
      "work",
      "other",
    ]);
  });

  it("previews and applies existing-note organization from the modal", async () => {
    const plan: ImportOrganizePlan = {
      id: "plan-1",
      rootFolder: "Aether Inbox",
      fromMonth: "2026/05",
      toMonth: "2026/05",
      items: [
        {
          noteId: "note-1",
          currentPath: "Aether Inbox/notes/2026/05/a.md",
          targetPath: "Aether Inbox/教程/2026/05/a.md",
          title: "A",
          categoryId: "tutorial",
          categoryLabel: "教程",
        },
      ],
    };
    const plugin = {
      openHubAndRefresh: vi.fn(),
      core: {
        settings: { current: migrateSettings({}) },
        previewOrganizeImports: vi.fn(async () => plan),
        applyOrganizeImports: vi.fn(async (nextPlan: ImportOrganizePlan) => ({
          moved: nextPlan.items,
          failures: [],
        })),
      },
    };
    const modal = new OrganizeImportsModal({} as never, plugin as never);
    modal.open();

    findButton(modal.contentEl, "生成预览")?.onclick?.();
    await settleAsyncHandlers();

    expect(plugin.core.previewOrganizeImports).toHaveBeenCalledWith({
      rootFolder: "Aether Inbox",
      fromMonth: null,
      toMonth: null,
    });
    expect(modal.contentEl.textContent).toContain("Aether Inbox/教程/2026/05/a.md");

    findButton(modal.contentEl, "移动所选 1 个")?.onclick?.();
    await settleAsyncHandlers();

    expect(plugin.core.applyOrganizeImports).toHaveBeenCalledWith(
      expect.objectContaining({ items: plan.items }),
    );
    expect(plugin.openHubAndRefresh).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.textContent).toContain("已移动 1 个");
  });
});

function makeImportPlugin(item: InboxItem) {
  const host = {
    data: {},
    async loadData() {
      return structuredClone(this.data);
    },
    async saveData(data: unknown) {
      this.data = structuredClone(data) as never;
    },
  };
  return {
    dataStore: new PluginDataStore(host),
    openHubAndRefresh: vi.fn(),
    core: {
      settings: { current: migrateSettings({}) },
      inbox: {
        listItems: vi.fn(() => [item]),
        getItem: vi.fn(() => item),
      },
      store: {
        getNote: vi.fn(() => null),
      },
      updateInboxItemDraft: vi.fn(),
      approveInboxItem: vi.fn(async () => ({
        id: "note-1",
        vaultPath: "Aether Inbox/历史/2026/05/item-1-title.md",
        title: "Title",
      })),
      discardInboxItem: vi.fn(),
      mergeInboxItem: vi.fn(),
    },
  };
}

function makeInboxItem(): InboxItem {
  return {
    id: "item-1",
    batchId: "batch-1",
    sourceKind: "paste",
    sourceRef: "paste",
    proposedTitle: "Title",
    proposedTags: [],
    proposedSummary: "",
    proposedCategoryId: "life",
    content: "body",
    kind: "note",
    url: null,
    duplicateOf: null,
    status: "pending",
    createdAt: Date.UTC(2026, 4, 24),
    decidedAt: null,
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
