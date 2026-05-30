import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateSettings, type InboxItem } from "@aether/core";
import { ImportModal } from "../src/modals/import-modal.js";
import { FakeElement, notices, openedModals } from "./fixtures/obsidian.js";

describe("import target privacy switch", () => {
  let body: FakeElement;

  beforeEach(() => {
    body = new FakeElement("body");
    notices.length = 0;
    openedModals.length = 0;
    vi.stubGlobal("document", { body });
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
      setTimeout: vi.fn((cb: () => void) => {
        cb();
        return 1;
      }),
      confirm: vi.fn(() => true),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks public target switch when risk confirmation is rejected", async () => {
    const plugin = makePlugin();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", {
      ...(window as unknown as Record<string, unknown>),
      confirm,
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
      setTimeout: vi.fn((cb: () => void) => {
        cb();
        return 1;
      }),
    });
    const modal = new ImportModal({} as never, plugin as never);
    modal.open();

    findButton(modal.contentEl, "公开导入")?.onclick?.();
    await Promise.resolve();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(plugin.core.settings.save).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("警示：当前为私密导入");
    const target = modal.contentEl.querySelector(".aether-import-target-wrap");
    expect(target?.cls).toContain("is-private");
    expect(modal.contentEl.querySelector(".aether-import-target-hint--private")).toBeTruthy();
  });

  it("forwards selected target to core importSource and persists last target", async () => {
    const plugin = makePlugin();
    const modal = new ImportModal({} as never, plugin as never);
    modal.open();

    findButton(modal.contentEl, "公开导入")?.onclick?.();
    await Promise.resolve();

    await (
      modal as unknown as {
        runImport(source: unknown): Promise<void>;
      }
    ).runImport({
      kind: "paste",
      label: "paste-1",
      payload: { type: "paste-text", text: "hello" },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.core.importSource).toHaveBeenCalledTimes(1);
    expect(plugin.core.importSource).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ privacyTarget: "public" }),
    );
    expect(plugin.core.settings.current.privacy.importLastTarget).toBe("public");
  });
});

function makePlugin() {
  let current = migrateSettings({});
  const item: InboxItem = {
    id: "item-1",
    batchId: "batch-1",
    sourceKind: "paste",
    sourceRef: "paste",
    proposedTitle: "hello",
    proposedTags: [],
    proposedSummary: "",
    proposedCategoryId: "other",
    content: "hello",
    kind: "note",
    url: null,
    duplicateOf: null,
    status: "pending",
    createdAt: 1,
    decidedAt: null,
  };
  return {
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
      importSource: vi.fn((_source, _options) => emitImportEvents(item)),
    },
  };
}

async function* emitImportEvents(item: InboxItem) {
  yield { type: "batch-started", batchId: "batch-1", sourceLabel: "paste" } as const;
  yield { type: "item-added", item } as const;
  yield { type: "batch-finished", batchId: "batch-1", total: 1 } as const;
}

function findButton(root: FakeElement, label: string): FakeElement | undefined {
  if (root.tag === "button" && root.textContent.includes(label)) return root;
  for (const child of root.children) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return undefined;
}
