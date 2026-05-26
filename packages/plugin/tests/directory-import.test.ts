import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginDataStore } from "../src/plugin-data-store.js";
import { listJobHistory } from "../src/job-history.js";
import {
  directoryImportPath,
  listDirectoryMarkdownFiles,
  runDirectoryImportJob,
  type DirectoryImportFileLike,
} from "../src/ui/directory-import.js";
import { FakeElement, notices } from "./fixtures/obsidian.js";

class DataHost {
  data: unknown = {};

  async loadData(): Promise<unknown> {
    return structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
  }
}

describe("directory import", () => {
  let body: FakeElement;

  beforeEach(() => {
    notices.length = 0;
    body = new FakeElement("body");
    vi.spyOn(Date, "now").mockReturnValue(1_000);
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

  it("normalizes directory import paths", () => {
    expect(
      directoryImportPath({
        name: "fallback.md",
        webkitRelativePath: "Vault\\Folder\\.\\Note.md",
        text: async () => "",
      }),
    ).toBe("Vault/Folder/Note.md");
    expect(directoryImportPath({ name: "Loose.md", text: async () => "" })).toBe("Loose.md");
  });

  it("keeps only markdown files and sorts by relative path", () => {
    const files = [
      file("root/z.png"),
      file("root/b.markdown"),
      file("root/a.md"),
      file("root/readme.txt"),
      file("root/deep/c.MD"),
    ];

    expect(listDirectoryMarkdownFiles(files).map(directoryImportPath)).toEqual([
      "root/a.md",
      "root/b.markdown",
      "root/deep/c.MD",
    ]);
  });

  it("imports markdown files in the background and records durable progress history", async () => {
    const host = new DataHost();
    const importSource = vi.fn(async function* (source: { label: string }) {
      yield {
        type: "item-added",
        item: { id: `item-${source.label}`, sourceRef: source.label },
      };
    });
    const approveInboxItem = vi.fn(async (id: string) => ({
      vaultPath: `Aether Inbox/${id}.md`,
      title: id,
    }));
    const plugin = {
      dataStore: new PluginDataStore(host),
      openHubAndRefresh: vi.fn(),
      core: {
        importSource,
        approveInboxItem,
      },
    };

    await runDirectoryImportJob(
      plugin as never,
      [file("batch/two.md", "# Two"), file("batch/one.md", "# One"), file("batch/skip.txt")],
      { target: "private" },
    );

    expect(importSource.mock.calls.map(([source]) => source.label)).toEqual([
      "batch/one.md",
      "batch/two.md",
    ]);
    expect(approveInboxItem).toHaveBeenCalledWith("item-batch/one.md", { target: "private" });
    expect(approveInboxItem).toHaveBeenCalledWith("item-batch/two.md", { target: "private" });
    expect(plugin.openHubAndRefresh).toHaveBeenCalledTimes(1);
    expect(notices).toContainEqual({
      message: "已后台导入 2/2 个文件",
      timeoutMs: 6000,
    });

    const [history] = await listJobHistory(plugin as never);
    expect(history).toMatchObject({
      kind: "import-write",
      title: "目录后台导入",
      status: "done",
      summary: {
        directory: true,
        total: 2,
        processed: 2,
        imported: 2,
        failed: 0,
        retained: 0,
        cancelled: false,
      },
      failures: [],
    });
  });
});

function file(path: string, content = ""): DirectoryImportFileLike {
  return {
    name: path.split("/").at(-1) ?? path,
    webkitRelativePath: path,
    text: async () => content,
  };
}
