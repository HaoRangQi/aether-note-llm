import { Notice } from "obsidian";
import type AetherPlugin from "../main.js";
import { isAetherError } from "@aether/core";
import { t } from "../i18n/index.js";
import { AiActivityIndicator } from "./ai-activity.js";
import { appendJobHistory } from "../job-history.js";
import {
  createExclusiveIndexJobRunner,
  type IndexJobCallbacks,
  type IndexJobKind,
} from "./index-job-guard.js";

export type JobState = "done" | "error" | "cancelled";

export interface JobTrackerOptions {
  title: string;
  icon: string;
  meta?: string;
  cancellable?: boolean;
}

export class JobTracker {
  private readonly indicator: AiActivityIndicator;
  private readonly abortController: AbortController | null;
  readonly startedAt: number;

  constructor(opts: JobTrackerOptions) {
    this.startedAt = Date.now();
    this.abortController = opts.cancellable ? new AbortController() : null;
    this.indicator = new AiActivityIndicator({
      roleName: opts.title,
      roleIcon: opts.icon,
      meta: opts.meta,
      onCancel: this.abortController
        ? () => {
            this.abortController?.abort();
          }
        : undefined,
    });
  }

  get signal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  get cancelled(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  update(meta: string): void {
    this.indicator.updateMeta(meta);
  }

  done(message: string, timeoutMs = 5000): void {
    this.finish("done", message, timeoutMs);
  }

  fail(message: string, timeoutMs = 6000): void {
    this.finish("error", message, timeoutMs);
  }

  cancel(message: string, timeoutMs = 5000): void {
    this.finish("cancelled", message, timeoutMs);
  }

  finish(state: JobState, message?: string, timeoutMs = 5000): void {
    this.indicator.hide(state);
    if (message) new Notice(message, timeoutMs);
  }
}

export function formatCountProgress(done: number, total: number): string {
  return t("job.progress.count", { done, total });
}

const runExclusiveIndexJob = createExclusiveIndexJobRunner((kind: IndexJobKind) => {
  new Notice(
    kind === "rebuild" ? t("job.rebuild.alreadyRunning") : t("job.indexRefresh.alreadyRunning"),
    3000,
  );
});

export async function runRebuildJob(
  plugin: AetherPlugin,
  opts: IndexJobCallbacks = {},
): Promise<void> {
  return runExclusiveIndexJob("rebuild", opts, () => runRebuildJobOnce(plugin, opts));
}

async function runRebuildJobOnce(
  plugin: AetherPlugin,
  opts: IndexJobCallbacks = {},
): Promise<void> {
  const job = new JobTracker({
    title: t("job.rebuild.title"),
    icon: "refresh-cw",
    meta: t("job.rebuild.scanning"),
    cancellable: true,
  });
  try {
    const r = await plugin.core.rebuildAll({
      signal: job.signal,
      onProgress: (p) => {
        if (p.phase === "scanning") {
          job.update(t("job.rebuild.scanning"));
        } else if (p.phase === "indexing") {
          job.update(t("job.rebuild.indexing", { done: p.scanned, total: p.total }));
        } else {
          job.update(
            t("job.rebuild.saving", {
              indexed: p.indexed,
              scanned: p.scanned,
              failed: p.failed,
            }),
          );
        }
      },
    });
    if (r.failures.length > 0) {
      console.warn("[Aether Rebuild] Skipped files:", r.failures);
    }
    await appendJobHistory(plugin, {
      kind: "rebuild",
      title: t("job.rebuild.title"),
      status: r.cancelled ? "cancelled" : r.failed > 0 ? "failed" : "done",
      startedAt: job.startedAt,
      finishedAt: Date.now(),
      summary: {
        scanned: r.scanned,
        indexed: r.indexed,
        failed: r.failed,
        cancelled: r.cancelled,
      },
      failures: r.failures.map((f) => ({ path: f.path, message: f.message })),
    });
    if (r.cancelled) {
      job.cancel(
        t("job.rebuild.cancelled", {
          indexed: r.indexed,
          scanned: r.scanned,
        }),
        8000,
      );
      await opts.onCancel?.();
      return;
    }
    job.done(
      r.failed > 0
        ? t("settings.advanced.rebuild.doneWithFailures", {
            indexed: r.indexed,
            scanned: r.scanned,
            failed: r.failed,
          })
        : t("settings.advanced.rebuild.done", { indexed: r.indexed, scanned: r.scanned }),
      r.failed > 0 ? 8000 : 5000,
    );
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (isAetherError(e) && e.code === "ABORTED") {
      await appendJobHistory(plugin, {
        kind: "rebuild",
        title: t("job.rebuild.title"),
        status: "cancelled",
        startedAt: job.startedAt,
        finishedAt: Date.now(),
        summary: {
          scanned: 0,
          indexed: 0,
          failed: 0,
          cancelled: true,
        },
        failures: [],
      });
      job.cancel(t("job.rebuild.cancelled", { indexed: 0, scanned: 0 }), 5000);
      await opts.onCancel?.();
      return;
    }
    await appendJobHistory(plugin, {
      kind: "rebuild",
      title: t("job.rebuild.title"),
      status: "failed",
      startedAt: job.startedAt,
      finishedAt: Date.now(),
      summary: {
        scanned: 0,
        indexed: 0,
        failed: 1,
        cancelled: false,
      },
      failures: [{ message: error.message }],
    });
    job.fail(t("rebuild.failed", { error: error.message }));
    opts.onError?.(error);
    return;
  }

  try {
    await opts.onDone?.();
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.warn("[Aether Rebuild] Follow-up refresh failed:", error);
    new Notice(t("job.rebuild.uiRefreshFailed", { error: error.message }), 5000);
  }
}

export async function runRefreshIndexJob(
  plugin: AetherPlugin,
  opts: IndexJobCallbacks = {},
): Promise<void> {
  return runExclusiveIndexJob("refresh", opts, () => runRefreshIndexJobOnce(plugin, opts));
}

async function runRefreshIndexJobOnce(
  plugin: AetherPlugin,
  opts: IndexJobCallbacks = {},
): Promise<void> {
  const job = new JobTracker({
    title: t("job.indexRefresh.title"),
    icon: "refresh-ccw",
    meta: t("job.indexRefresh.scanning"),
    cancellable: true,
  });
  try {
    job.update(t("job.indexRefresh.refreshing"));
    const r = await plugin.core.refreshChangedIndex({ signal: job.signal });
    job.update(
      t("job.indexRefresh.saving", {
        refreshed: r.reindexedNotes.length,
        removed: r.deletedNotes.length,
      }),
    );
    await appendJobHistory(plugin, {
      kind: "index-refresh",
      title: t("job.indexRefresh.title"),
      status: r.failures.length > 0 ? "failed" : "done",
      startedAt: job.startedAt,
      finishedAt: Date.now(),
      summary: {
        scanned: r.health.scannedFiles,
        stale: r.staleNotes,
        missing: r.missingFiles,
        refreshed: r.reindexedNotes.length,
        removed: r.deletedNotes.length,
        indexed: r.indexedNotes,
        failed: r.failures.length,
      },
      failures: r.failures.map((f) => ({ path: f.path, message: f.message })),
    });
    job.done(
      r.failures.length > 0
        ? t("settings.advanced.refresh.doneWithFailures", {
            refreshed: r.reindexedNotes.length,
            removed: r.deletedNotes.length,
            failed: r.failures.length,
          })
        : t("settings.advanced.refresh.done", {
            refreshed: r.reindexedNotes.length,
            removed: r.deletedNotes.length,
          }),
      r.failures.length > 0 ? 8000 : 5000,
    );
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (isAetherError(e) && e.code === "ABORTED") {
      await appendJobHistory(plugin, {
        kind: "index-refresh",
        title: t("job.indexRefresh.title"),
        status: "cancelled",
        startedAt: job.startedAt,
        finishedAt: Date.now(),
        summary: {
          scanned: 0,
          refreshed: 0,
          removed: 0,
          failed: 0,
          cancelled: true,
        },
        failures: [],
      });
      job.cancel(t("job.indexRefresh.cancelled"), 5000);
      await opts.onCancel?.();
      return;
    }
    await appendJobHistory(plugin, {
      kind: "index-refresh",
      title: t("job.indexRefresh.title"),
      status: "failed",
      startedAt: job.startedAt,
      finishedAt: Date.now(),
      summary: {
        scanned: 0,
        refreshed: 0,
        removed: 0,
        failed: 1,
      },
      failures: [{ message: error.message }],
    });
    job.fail(t("settings.advanced.refresh.failed", { error: error.message }));
    opts.onError?.(error);
    return;
  }

  try {
    await opts.onDone?.();
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.warn("[Aether IndexRefresh] Follow-up refresh failed:", error);
    new Notice(t("job.indexRefresh.uiRefreshFailed", { error: error.message }), 5000);
  }
}
