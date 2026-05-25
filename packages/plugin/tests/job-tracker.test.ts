import { AetherError } from "@aether/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notices, FakeElement } from "./fixtures/obsidian.js";
import { PluginDataStore } from "../src/plugin-data-store.js";
import { runRebuildJob, runRefreshIndexJob } from "../src/ui/job-tracker.js";

class DataHost {
  data: unknown = {};

  async loadData(): Promise<unknown> {
    return structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
  }
}

describe("tracked index jobs", () => {
  beforeEach(() => {
    notices.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.stubGlobal("document", { body: new FakeElement("body") });
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
      setTimeout: vi.fn((cb: () => void) => {
        cb();
        return 1;
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records refresh cancellation as cancelled and restores callers via onCancel", async () => {
    const plugin = makePlugin({
      refreshChangedIndex: vi
        .fn()
        .mockRejectedValue(new AetherError("ABORTED", "Refresh cancelled")),
    });
    const onCancel = vi.fn();

    await runRefreshIndexJob(plugin, { onCancel });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(notices).toContainEqual({ message: "已取消索引刷新", timeoutMs: 5000 });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "index-refresh",
      status: "cancelled",
      summary: {
        cancelled: true,
        failed: 0,
      },
      failures: [],
    });
  });

  it("records refresh errors as failed and reports them through onError", async () => {
    const error = new Error("Index store unavailable");
    const plugin = makePlugin({
      refreshChangedIndex: vi.fn().mockRejectedValue(error),
    });
    const onCancel = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await runRefreshIndexJob(plugin, { onCancel, onDone, onError });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);
    expect(notices).toContainEqual({
      message: "刷新索引失败：Index store unavailable",
      timeoutMs: 6000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "index-refresh",
      status: "failed",
      summary: {
        scanned: 0,
        refreshed: 0,
        removed: 0,
        failed: 1,
      },
      failures: [{ message: "Index store unavailable" }],
    });
  });

  it("keeps a successful refresh job done when the follow-up UI refresh fails", async () => {
    const plugin = makePlugin({
      refreshChangedIndex: vi.fn().mockResolvedValue(refreshResult({ refreshed: 2, removed: 1 })),
    });
    const onDone = vi.fn().mockRejectedValue(new Error("Hub unavailable"));
    const onError = vi.fn();

    await runRefreshIndexJob(plugin, { onDone, onError });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(notices).toContainEqual({
      message: "已刷新索引：更新 2 个，移除 1 个",
      timeoutMs: 5000,
    });
    expect(notices).toContainEqual({
      message: "索引已刷新，但界面刷新失败：Hub unavailable",
      timeoutMs: 5000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "index-refresh",
      status: "done",
      summary: {
        refreshed: 2,
        removed: 1,
        failed: 0,
      },
    });
  });

  it("records refresh partial failures in recent jobs and still calls onDone", async () => {
    const plugin = makePlugin({
      refreshChangedIndex: vi
        .fn()
        .mockResolvedValue(refreshResult({ refreshed: 2, removed: 1, failed: 1 })),
    });
    const onDone = vi.fn();
    const onError = vi.fn();

    await runRefreshIndexJob(plugin, { onDone, onError });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(notices).toContainEqual({
      message: "已刷新索引：更新 2 个，移除 1 个，失败 1 个；详情见最近任务",
      timeoutMs: 8000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "index-refresh",
      status: "failed",
      summary: {
        scanned: 4,
        refreshed: 2,
        removed: 1,
        indexed: 2,
        failed: 1,
      },
      failures: [{ path: "Failed 0.md", message: "Failure 0" }],
    });
  });

  it("records rebuild partial failures in recent jobs and still calls onDone", async () => {
    const plugin = makePlugin({
      rebuildAll: vi.fn().mockResolvedValue({
        scanned: 4,
        indexed: 3,
        failed: 1,
        cancelled: false,
        failures: [{ path: "Broken.md", message: "Cannot parse frontmatter" }],
      }),
    });
    const onDone = vi.fn();

    await runRebuildJob(plugin, { onDone });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(notices).toContainEqual({
      message: "已重建：成功 3/4 个文件，失败 1 个；详情见控制台日志",
      timeoutMs: 8000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "rebuild",
      status: "failed",
      summary: {
        scanned: 4,
        indexed: 3,
        failed: 1,
        cancelled: false,
      },
      failures: [{ path: "Broken.md", message: "Cannot parse frontmatter" }],
    });
  });

  it("records rebuild result cancellation as cancelled and restores callers via onCancel", async () => {
    const plugin = makePlugin({
      rebuildAll: vi.fn().mockResolvedValue({
        scanned: 5,
        indexed: 2,
        failed: 0,
        cancelled: true,
        failures: [],
      }),
    });
    const onCancel = vi.fn();
    const onDone = vi.fn();

    await runRebuildJob(plugin, { onCancel, onDone });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(notices).toContainEqual({
      message: "已取消重建：已索引 2/5 个文件",
      timeoutMs: 8000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "rebuild",
      status: "cancelled",
      summary: {
        scanned: 5,
        indexed: 2,
        failed: 0,
        cancelled: true,
      },
      failures: [],
    });
  });

  it("records rebuild abort errors as cancelled and restores callers via onCancel", async () => {
    const plugin = makePlugin({
      rebuildAll: vi.fn().mockRejectedValue(new AetherError("ABORTED", "Rebuild cancelled")),
    });
    const onCancel = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await runRebuildJob(plugin, { onCancel, onDone, onError });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(notices).toContainEqual({
      message: "已取消重建：已索引 0/0 个文件",
      timeoutMs: 5000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "rebuild",
      status: "cancelled",
      summary: {
        scanned: 0,
        indexed: 0,
        failed: 0,
        cancelled: true,
      },
      failures: [],
    });
  });

  it("records rebuild errors as failed and reports them through onError", async () => {
    const error = new Error("Index write failed");
    const plugin = makePlugin({
      rebuildAll: vi.fn().mockRejectedValue(error),
    });
    const onCancel = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await runRebuildJob(plugin, { onCancel, onDone, onError });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);
    expect(notices).toContainEqual({
      message: "重建失败：Index write failed",
      timeoutMs: 6000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "rebuild",
      status: "failed",
      summary: {
        scanned: 0,
        indexed: 0,
        failed: 1,
        cancelled: false,
      },
      failures: [{ message: "Index write failed" }],
    });
  });

  it("keeps a successful rebuild job done when the follow-up UI refresh fails", async () => {
    const plugin = makePlugin({
      rebuildAll: vi.fn().mockResolvedValue({
        scanned: 3,
        indexed: 3,
        failed: 0,
        cancelled: false,
        failures: [],
      }),
    });
    const onDone = vi.fn().mockRejectedValue(new Error("Hub unavailable"));
    const onError = vi.fn();

    await runRebuildJob(plugin, { onDone, onError });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(notices).toContainEqual({
      message: "已重建：3/3 个文件",
      timeoutMs: 5000,
    });
    expect(notices).toContainEqual({
      message: "索引已重建，但界面刷新失败：Hub unavailable",
      timeoutMs: 5000,
    });
    const [job] = await listHistory(plugin);
    expect(job).toMatchObject({
      kind: "rebuild",
      status: "done",
      summary: {
        scanned: 3,
        indexed: 3,
        failed: 0,
        cancelled: false,
      },
    });
  });
});

function makePlugin(coreOverrides: Record<string, unknown>) {
  const host = new DataHost();
  return {
    dataStore: new PluginDataStore(host),
    core: {
      rebuildAll: vi.fn().mockResolvedValue({
        scanned: 0,
        indexed: 0,
        failed: 0,
        cancelled: false,
        failures: [],
      }),
      refreshChangedIndex: vi.fn().mockResolvedValue(refreshResult()),
      ...coreOverrides,
    },
  } as never;
}

function refreshResult(overrides: { refreshed?: number; removed?: number; failed?: number } = {}) {
  const refreshed = overrides.refreshed ?? 0;
  const removed = overrides.removed ?? 0;
  const failed = overrides.failed ?? 0;
  return {
    staleNotes: 0,
    missingFiles: 0,
    reindexedNotes: Array.from({ length: refreshed }, (_, i) => `Note ${i}.md`),
    deletedNotes: Array.from({ length: removed }, (_, i) => `Deleted ${i}.md`),
    indexedNotes: refreshed,
    failures: Array.from({ length: failed }, (_, i) => ({
      path: `Failed ${i}.md`,
      message: `Failure ${i}`,
    })),
    health: {
      scannedFiles: refreshed + removed + failed,
    },
  };
}

async function listHistory(plugin: { dataStore: PluginDataStore }) {
  return plugin.dataStore.read((data) => data.jobHistory as unknown[]);
}
