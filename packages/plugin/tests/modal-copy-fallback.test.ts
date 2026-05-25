import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeElement, Modal, notices } from "./fixtures/obsidian.js";

const { DiagnosticsModal } = await import("../src/modals/diagnostics-modal.js");
const { JobHistoryModal } = await import("../src/modals/job-history-modal.js");
const { RewriteResultModal } = await import("../src/modals/rewrite-result-modal.js");
const { UsageModal } = await import("../src/modals/usage-modal.js");

describe("modal copy fallback", () => {
  beforeEach(() => {
    notices.length = 0;
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
  });

  it("keeps diagnostics JSON visible when clipboard copy fails", async () => {
    const modal = new DiagnosticsModal({} as never, makePlugin()) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();
    const before = modal.contentEl.textContent;

    await clickButton(modal.contentEl, "复制到剪贴板");

    expect(notices).toContainEqual({
      message: "复制失败，请检查剪贴板权限后重试。",
      timeoutMs: 5000,
    });
    expect(modal.contentEl.textContent).toBe(before);
    expect(modal.contentEl.textContent).toContain('"pluginVersion": "0.3.0"');
  });

  it("renders diagnostics JSON with recent jobs and usage snapshot", async () => {
    const modal = new DiagnosticsModal(
      {} as never,
      makePlugin({
        jobHistory: [
          {
            id: "import-write-1",
            kind: "import-write",
            title: "Import write",
            status: "failed",
            startedAt: 1_800_000_000_000,
            finishedAt: 1_800_000_005_000,
            summary: {
              written: 4,
              failed: 1,
            },
            failures: [
              {
                path: "Aether Inbox/imported.md",
                message: "Vault write failed",
              },
            ],
          },
        ],
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: 321,
            completionTokens: 123,
          },
          perFeature: {
            summarize: {
              promptTokens: 200,
              completionTokens: 100,
            },
          },
        },
      }),
    ) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();

    expect(modal.contentEl.textContent).toContain('"recentJobs"');
    expect(modal.contentEl.textContent).toContain('"kind": "import-write"');
    expect(modal.contentEl.textContent).toContain('"written": 4');
    expect(modal.contentEl.textContent).toContain('"path": "Aether Inbox/imported.md"');
    expect(modal.contentEl.textContent).toContain('"usage"');
    expect(modal.contentEl.textContent).toContain('"promptTokens": 321');
    expect(modal.contentEl.textContent).toContain('"completionTokens": 123');
    expect(modal.contentEl.textContent).toContain('"summarize"');
  });

  it("copies diagnostics JSON with recent jobs and usage snapshot", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new DiagnosticsModal(
      {} as never,
      makePlugin({
        jobHistory: [
          {
            id: "rebuild-1",
            kind: "rebuild",
            title: "Rebuild index",
            status: "done",
            startedAt: 1_800_000_000_000,
            finishedAt: 1_800_000_015_000,
            summary: {
              scanned: 9,
              indexed: 9,
            },
            failures: [],
          },
        ],
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: 111,
            completionTokens: 222,
          },
          perFeature: {
            answer: {
              promptTokens: 100,
              completionTokens: 200,
            },
          },
        },
      }),
    ) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();

    await clickButton(modal.contentEl, "复制到剪贴板");

    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toMatchObject({
      pluginVersion: "0.3.0",
      obsidianApi: "1.6.0",
      indexCount: 1,
      chunkCount: 1,
      pendingInbox: 0,
      recentJobs: [
        {
          kind: "rebuild",
          status: "done",
          summary: {
            scanned: 9,
            indexed: 9,
          },
        },
      ],
      usage: {
        month: "2026-05",
        monthTotal: {
          promptTokens: 111,
          completionTokens: 222,
        },
        perFeature: {
          answer: {
            promptTokens: 100,
            completionTokens: 200,
          },
        },
      },
    });
    expect(notices).toContainEqual({
      message: "已复制到剪贴板",
      timeoutMs: 2000,
    });
    expect(modal.contentEl.textContent).toContain('"recentJobs"');
    expect(modal.contentEl.textContent).toContain('"usage"');
  });

  it("keeps diagnostics export available when recent jobs cannot be read", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const modal = new DiagnosticsModal(
      {} as never,
      makePlugin({
        jobHistoryReadError: new Error("data.json unavailable"),
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: 42,
            completionTokens: 24,
          },
          perFeature: {},
        },
      }),
    ) as unknown as Modal;

    try {
      await (modal as unknown as { render(): Promise<void> }).render();
      await clickButton(modal.contentEl, "复制到剪贴板");

      expect(writeText).toHaveBeenCalledOnce();
      expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toMatchObject({
        pluginVersion: "0.3.0",
        recentJobs: [],
        usage: {
          month: "2026-05",
          monthTotal: {
            promptTokens: 42,
            completionTokens: 24,
          },
        },
      });
      expect(modal.contentEl.textContent).toContain('"recentJobs": []');
      expect(modal.contentEl.textContent).toContain('"usage"');
      expect(warn).toHaveBeenCalledWith(
        "[Aether JobHistory] Failed to read job history:",
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps recent job rows visible when JSON copy fails", async () => {
    const modal = new JobHistoryModal({} as never, makePlugin()) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();
    const before = modal.contentEl.textContent;

    await clickButton(modal.contentEl, "复制 JSON");

    expect(notices).toContainEqual({
      message: "复制失败，请检查剪贴板权限后重试。",
      timeoutMs: 5000,
    });
    expect(modal.contentEl.textContent).toBe(before);
    expect(modal.contentEl.textContent).toContain("刷新索引变更");
    expect(modal.contentEl.textContent).toContain("Network timeout");
  });

  it("renders failed recent jobs with duration, summary, and failure details", async () => {
    const modal = new JobHistoryModal(
      {} as never,
      makePlugin({
        jobHistory: [
          {
            id: "rebuild-failed",
            kind: "rebuild",
            title: "Rebuild index",
            status: "failed",
            startedAt: 1_800_000_000_000,
            finishedAt: 1_800_000_065_000,
            summary: {
              scanned: 12,
              indexed: 10,
              failed: 2,
            },
            failures: [
              {
                title: "Broken note",
                path: "Aether Inbox/broken.md",
                message: "Cannot parse frontmatter",
              },
              {
                path: "Aether Inbox/timeout.md",
                message: "Embedding request timed out",
              },
            ],
          },
        ],
      }),
    ) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();

    expect(modal.contentEl.textContent).toContain("重建索引");
    expect(modal.contentEl.textContent).toContain("失败");
    expect(modal.contentEl.textContent).toContain("耗时 1m 5s");
    expect(modal.contentEl.textContent).toContain("scanned12");
    expect(modal.contentEl.textContent).toContain("indexed10");
    expect(modal.contentEl.textContent).toContain("failed2");
    expect(modal.contentEl.textContent).toContain("失败摘要（2）");
    expect(modal.contentEl.textContent).toContain("Broken note");
    expect(modal.contentEl.textContent).toContain("Aether Inbox/broken.md");
    expect(modal.contentEl.textContent).toContain("Cannot parse frontmatter");
    expect(modal.contentEl.textContent).toContain("Aether Inbox/timeout.md");
    expect(modal.contentEl.textContent).toContain("Embedding request timed out");
    expect(findButton(modal.contentEl, "复制 JSON")?.disabled).toBe(false);
  });

  it("copies recent jobs JSON with status, summary, and failure details", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new JobHistoryModal(
      {} as never,
      makePlugin({
        jobHistory: [
          {
            id: "index-refresh-copy",
            kind: "index-refresh",
            title: "Refresh index",
            status: "failed",
            startedAt: 1_800_000_000_000,
            finishedAt: 1_800_000_003_000,
            summary: {
              scanned: 5,
              refreshed: 3,
              failed: 1,
            },
            failures: [
              {
                path: "Inbox/source.md",
                message: "Network timeout",
              },
            ],
          },
        ],
      }),
    ) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();

    await clickButton(modal.contentEl, "复制 JSON");

    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toEqual([
      {
        id: "index-refresh-copy",
        kind: "index-refresh",
        title: "Refresh index",
        status: "failed",
        startedAt: 1_800_000_000_000,
        finishedAt: 1_800_000_003_000,
        summary: {
          scanned: 5,
          refreshed: 3,
          failed: 1,
        },
        failures: [
          {
            path: "Inbox/source.md",
            message: "Network timeout",
          },
        ],
      },
    ]);
    expect(notices).toContainEqual({
      message: "任务历史已复制",
      timeoutMs: 2000,
    });
    expect(modal.contentEl.textContent).toContain("刷新索引变更");
    expect(modal.contentEl.textContent).toContain("Network timeout");
  });

  it("disables recent jobs JSON copy when there is no history", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new JobHistoryModal(
      {} as never,
      makePlugin({ jobHistory: [] }),
    ) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();

    const copy = findButton(modal.contentEl, "复制 JSON");
    expect(copy).toBeTruthy();
    expect(copy?.disabled).toBe(true);
    expect(modal.contentEl.textContent).toContain("还没有导入或重建任务记录。");

    await copy?.onclick?.();

    expect(writeText).not.toHaveBeenCalled();
    expect(notices).not.toContainEqual({
      message: "任务历史已复制",
      timeoutMs: 2000,
    });
  });

  it("falls back to the empty recent jobs state when history cannot be read", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const modal = new JobHistoryModal(
      {} as never,
      makePlugin({ jobHistoryReadError: new Error("data.json unavailable") }),
    ) as unknown as Modal;

    try {
      await (modal as unknown as { render(): Promise<void> }).render();

      const copy = findButton(modal.contentEl, "复制 JSON");
      expect(copy).toBeTruthy();
      expect(copy?.disabled).toBe(true);
      expect(modal.contentEl.textContent).toContain("还没有导入或重建任务记录。");
      expect(modal.contentEl.textContent).not.toContain("刷新索引变更");

      await copy?.onclick?.();

      expect(writeText).not.toHaveBeenCalled();
      expect(notices).not.toContainEqual({
        message: "任务历史已复制",
        timeoutMs: 2000,
      });
      expect(warn).toHaveBeenCalledWith(
        "[Aether JobHistory] Failed to read job history:",
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("renders cancelled recent jobs with summary but no failure section", async () => {
    const modal = new JobHistoryModal(
      {} as never,
      makePlugin({
        jobHistory: [
          {
            id: "import-write-cancelled",
            kind: "import-write",
            title: "Import write",
            status: "cancelled",
            startedAt: 1_800_000_000_000,
            finishedAt: 1_800_000_004_000,
            summary: {
              done: 2,
              total: 5,
              cancelled: true,
            },
            failures: [],
          },
        ],
      }),
    ) as unknown as Modal;

    await (modal as unknown as { render(): Promise<void> }).render();

    expect(modal.contentEl.textContent).toContain("导入写入");
    expect(modal.contentEl.textContent).toContain("已取消");
    expect(modal.contentEl.textContent).toContain("done2");
    expect(modal.contentEl.textContent).toContain("total5");
    expect(modal.contentEl.textContent).toContain("cancelledtrue");
    expect(modal.contentEl.textContent).not.toContain("失败明细");
    expect(findButton(modal.contentEl, "复制 JSON")?.disabled).toBe(false);
  });

  it("keeps usage metrics visible when JSON copy fails", async () => {
    const modal = new UsageModal({} as never, makePlugin()) as unknown as Modal;

    modal.onOpen();
    const before = modal.contentEl.textContent;

    await clickButton(modal.contentEl, "复制 JSON");

    expect(notices).toContainEqual({
      message: "复制失败，请检查剪贴板权限后重试。",
      timeoutMs: 5000,
    });
    expect(modal.contentEl.textContent).toBe(before);
    expect(modal.contentEl.textContent).toContain("本月用量");
    expect(modal.contentEl.textContent).toContain("2,000");
  });

  it("copies usage JSON with budget and feature usage snapshot", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        monthlyTokenWarn: 2500,
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: 700,
            completionTokens: 300,
          },
          perFeature: {
            answer: {
              promptTokens: 500,
              completionTokens: 250,
            },
            rewrite: {
              promptTokens: 200,
              completionTokens: 50,
            },
          },
        },
      }),
    ) as unknown as Modal;

    modal.onOpen();

    await clickButton(modal.contentEl, "复制 JSON");

    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toEqual({
      budget: 2500,
      usage: {
        month: "2026-05",
        monthTotal: {
          promptTokens: 700,
          completionTokens: 300,
        },
        perFeature: {
          answer: {
            promptTokens: 500,
            completionTokens: 250,
          },
          rewrite: {
            promptTokens: 200,
            completionTokens: 50,
          },
        },
      },
    });
    expect(notices).toContainEqual({
      message: "用量 JSON 已复制",
      timeoutMs: 2000,
    });
    expect(modal.contentEl.textContent).toContain("本月用量");
    expect(modal.contentEl.textContent).toContain("1,000");
  });

  it("normalizes non-finite usage numbers before rendering and copying JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        monthlyTokenWarn: 100,
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: Number.NaN,
            completionTokens: Number.POSITIVE_INFINITY,
          },
          perFeature: {
            answer: {
              promptTokens: 12,
              completionTokens: Number.NEGATIVE_INFINITY,
            },
          },
        },
      }),
    ) as unknown as Modal;

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain("0总 Token");
    expect(modal.contentEl.textContent).toContain("0Prompt");
    expect(modal.contentEl.textContent).toContain("0Completion");
    expect(modal.contentEl.textContent).toContain("12 token");
    expect(modal.contentEl.textContent).toContain("Prompt 12 · Completion 0");
    expect(modal.contentEl.textContent).not.toContain("NaN");
    expect(modal.contentEl.textContent).not.toContain("Infinity");

    await clickButton(modal.contentEl, "复制 JSON");

    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toEqual({
      budget: 100,
      usage: {
        month: "2026-05",
        monthTotal: {
          promptTokens: 0,
          completionTokens: 0,
        },
        perFeature: {
          answer: {
            promptTokens: 12,
            completionTokens: 0,
          },
        },
      },
    });
  });

  it("normalizes negative and fractional usage numbers before rendering and copying JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: -4,
            completionTokens: 8.7,
          },
          perFeature: {
            answer: {
              promptTokens: 2.9,
              completionTokens: -1,
            },
          },
        },
      }),
    ) as unknown as Modal;

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain("8总 Token");
    expect(modal.contentEl.textContent).toContain("0Prompt");
    expect(modal.contentEl.textContent).toContain("8Completion");
    expect(modal.contentEl.textContent).toContain("2 token");
    expect(modal.contentEl.textContent).toContain("Prompt 2 · Completion 0");
    expect(modal.contentEl.textContent).not.toContain("-4");
    expect(modal.contentEl.textContent).not.toContain("8.7");
    expect(modal.contentEl.textContent).not.toContain("2.9");

    await clickButton(modal.contentEl, "复制 JSON");

    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toEqual({
      budget: 5000,
      usage: {
        month: "2026-05",
        monthTotal: {
          promptTokens: 0,
          completionTokens: 8,
        },
        perFeature: {
          answer: {
            promptTokens: 2,
            completionTokens: 0,
          },
        },
      },
    });
  });

  it("keeps rewrite result text visible when AI output copy fails", async () => {
    const modal = new RewriteResultModal(
      {} as never,
      "Original selection",
      "Rewritten output",
      vi.fn(),
    ) as unknown as Modal;

    modal.onOpen();
    const before = modal.contentEl.textContent;

    await clickButton(modal.contentEl, "复制");

    expect(notices).toContainEqual({
      message: "复制失败，请检查剪贴板权限后重试。",
      timeoutMs: 5000,
    });
    expect(modal.contentEl.textContent).toBe(before);
    expect(modal.contentEl.textContent).toContain("Original selection");
    expect(modal.contentEl.textContent).toContain("Rewritten output");
  });

  it("copies only the rewritten AI output from the rewrite result modal", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new RewriteResultModal(
      {} as never,
      "Original selection",
      "Rewritten output",
      vi.fn(),
    ) as unknown as Modal;

    modal.onOpen();

    await clickButton(modal.contentEl, "复制");

    expect(writeText).toHaveBeenCalledWith("Rewritten output");
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("Original selection"));
    expect(notices).toContainEqual({
      message: "已复制",
      timeoutMs: 2000,
    });
    expect(modal.contentEl.textContent).toContain("Original selection");
    expect(modal.contentEl.textContent).toContain("Rewritten output");
  });

  it("applies rewrite result text and closes the modal", () => {
    const onApply = vi.fn();
    const modal = new RewriteResultModal(
      {} as never,
      "Original selection",
      "Rewritten output",
      onApply,
    ) as unknown as Modal;

    modal.onOpen();
    clickButtonSync(modal.contentEl, "替换选中文本");

    expect(onApply).toHaveBeenCalledWith("Rewritten output");
    expect(modal.contentEl.textContent).toBe("");
  });

  it("discards rewrite result text without applying it", () => {
    const onApply = vi.fn();
    const modal = new RewriteResultModal(
      {} as never,
      "Original selection",
      "Rewritten output",
      onApply,
    ) as unknown as Modal;

    modal.onOpen();
    clickButtonSync(modal.contentEl, "丢弃");

    expect(onApply).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toBe("");
  });

  it("copies zeroed usage JSON from the empty usage state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        usageSnapshot: {
          month: "2026-05",
          monthTotal: {
            promptTokens: 0,
            completionTokens: 0,
          },
          perFeature: {},
        },
      }),
    ) as unknown as Modal;

    modal.onOpen();

    const copy = findButton(modal.contentEl, "复制 JSON");
    expect(copy).toBeTruthy();
    expect(copy?.disabled).toBe(false);
    expect(modal.contentEl.textContent).toContain("本月还没有记录到 AI token 用量。");
    expect(modal.contentEl.textContent).toContain("0总 Token");
    expect(modal.contentEl.textContent).toContain("0Prompt");
    expect(modal.contentEl.textContent).toContain("0Completion");

    await clickButton(modal.contentEl, "复制 JSON");

    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toEqual({
      budget: 5000,
      usage: {
        month: "2026-05",
        monthTotal: {
          promptTokens: 0,
          completionTokens: 0,
        },
        perFeature: {},
      },
    });
    expect(notices).toContainEqual({
      message: "用量 JSON 已复制",
      timeoutMs: 2000,
    });
  });

  it("copies usage JSON with a null budget when the budget is unset", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        monthlyTokenWarn: null,
      }),
    ) as unknown as Modal;

    modal.onOpen();

    const copy = findButton(modal.contentEl, "复制 JSON");
    expect(copy).toBeTruthy();
    expect(copy?.disabled).toBe(false);
    expect(modal.contentEl.textContent).toContain("尚未设置月度预算提醒");
    expect(modal.contentEl.textContent).toContain(
      "可在 Settings → Advanced 设置 monthly token warn。",
    );
    expect(modal.contentEl.textContent).toContain("2,000总 Token");
    expect(modal.contentEl.textContent).not.toContain("已达到或超过月度预算提醒阈值");

    await clickButton(modal.contentEl, "复制 JSON");

    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toMatchObject({
      budget: null,
      usage: {
        month: "2026-05",
        monthTotal: {
          promptTokens: 1200,
          completionTokens: 800,
        },
      },
    });
    expect(notices).toContainEqual({
      message: "用量 JSON 已复制",
      timeoutMs: 2000,
    });
  });

  it("normalizes invalid usage budget thresholds before rendering and copying JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        monthlyTokenWarn: Number.POSITIVE_INFINITY,
      }),
    ) as unknown as Modal;

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain("尚未设置月度预算提醒");
    expect(modal.contentEl.textContent).toContain(
      "可在 Settings → Advanced 设置 monthly token warn。",
    );
    expect(modal.contentEl.textContent).not.toContain("Infinity");
    expect(modal.contentEl.textContent).not.toContain("已达到或超过月度预算提醒阈值");

    await clickButton(modal.contentEl, "复制 JSON");

    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toMatchObject({
      budget: null,
      usage: {
        monthTotal: {
          promptTokens: 1200,
          completionTokens: 800,
        },
      },
    });
  });

  it("normalizes fractional usage budget thresholds before rendering and copying JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        monthlyTokenWarn: 1500.8,
      }),
    ) as unknown as Modal;

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain("已用 2,000 / 1,500 token");
    expect(modal.contentEl.textContent).not.toContain("1,500.8");

    await clickButton(modal.contentEl, "复制 JSON");

    expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? "")).toMatchObject({
      budget: 1500,
      usage: {
        monthTotal: {
          promptTokens: 1200,
          completionTokens: 800,
        },
      },
    });
  });

  it("shows the monthly budget warning when usage reaches the configured threshold", () => {
    const modal = new UsageModal(
      {} as never,
      makePlugin({
        monthlyTokenWarn: 1500,
      }),
    ) as unknown as Modal;

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain("已用 2,000 / 1,500 token");
    expect(modal.contentEl.textContent).toContain("已达到或超过月度预算提醒阈值");
    expect(modal.contentEl.textContent).toContain("综合回答");
    expect(modal.contentEl.textContent).toContain("2,000 token");
  });
});

function makePlugin(
  opts: {
    jobHistory?: unknown[];
    jobHistoryReadError?: Error;
    monthlyTokenWarn?: number | null;
    usageSnapshot?: {
      month: string;
      monthTotal: { promptTokens: number; completionTokens: number };
      perFeature: Record<string, { promptTokens: number; completionTokens: number }>;
    };
  } = {},
) {
  return {
    manifest: {
      version: "0.3.0",
      minAppVersion: "1.6.0",
    },
    core: {
      settings: {
        current: {
          budgets: {
            monthlyTokenWarn: "monthlyTokenWarn" in opts ? opts.monthlyTokenWarn : 5000,
          },
          providers: [],
          apiKeys: {},
        },
      },
      store: {
        allNotes: () => [{ id: "n1" }],
        allChunks: () => [{ id: "c1" }],
      },
      inbox: {
        listItems: () => [],
      },
      usage: {
        snapshot: () =>
          opts.usageSnapshot ?? {
            month: "2026-05",
            monthTotal: {
              promptTokens: 1200,
              completionTokens: 800,
            },
            perFeature: {
              answer: {
                promptTokens: 1200,
                completionTokens: 800,
              },
            },
          },
      },
    },
    dataStore: {
      read: async (cb: (data: Record<string, unknown>) => unknown) => {
        if (opts.jobHistoryReadError) throw opts.jobHistoryReadError;
        return cb({
          jobHistory: opts.jobHistory ?? [
            {
              id: "index-refresh-1",
              kind: "index-refresh",
              title: "Refresh index",
              status: "failed",
              startedAt: 1_800_000_000_000,
              finishedAt: 1_800_000_003_000,
              summary: {
                scanned: 3,
                failed: 1,
              },
              failures: [
                {
                  path: "Inbox/source.md",
                  message: "Network timeout",
                },
              ],
            },
          ],
        });
      },
    },
  };
}

async function clickButton(root: FakeElement, text: string): Promise<void> {
  const button = findButton(root, text);
  expect(button, `button ${text} should exist`).toBeTruthy();
  await button?.onclick?.();
}

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  if (root.tag === "button" && root.text === text) return root;
  for (const child of root.children) {
    const result = findButton(child, text);
    if (result) return result;
  }
  return undefined;
}

function clickButtonSync(root: FakeElement, text: string): void {
  const button = findButton(root, text);
  expect(button, `button ${text} should exist`).toBeTruthy();
  button?.onclick?.();
}
