import { Notice } from "obsidian";
import type AetherPlugin from "../main.js";
import { appendJobHistory } from "../job-history.js";
import { t } from "../i18n/index.js";
import { JobTracker } from "./job-tracker.js";
import { isMarkdownFileName } from "./import-source.js";
import type { InboxItem } from "@aether/core";

type ImportTarget = "public" | "private";

interface DirectoryImportFailure {
  path: string;
  message: string;
  retained?: boolean;
}

export interface DirectoryImportFileLike {
  name: string;
  webkitRelativePath?: string;
  text(): Promise<string>;
}

export function listDirectoryMarkdownFiles(
  files: Iterable<DirectoryImportFileLike>,
): DirectoryImportFileLike[] {
  return Array.from(files)
    .filter((file) => isMarkdownFileName(directoryImportPath(file)))
    .sort((a, b) => directoryImportPath(a).localeCompare(directoryImportPath(b)));
}

export function directoryImportPath(file: DirectoryImportFileLike): string {
  return normalizeImportPath(file.webkitRelativePath || file.name);
}

export async function runDirectoryImportJob(
  plugin: AetherPlugin,
  rawFiles: Iterable<DirectoryImportFileLike>,
  options: { target: ImportTarget },
): Promise<void> {
  const files = listDirectoryMarkdownFiles(rawFiles);
  if (files.length === 0) {
    new Notice(t("modal.import.directory.empty"), 4000);
    return;
  }

  const job = new JobTracker({
    title: t("job.directoryImport.title"),
    icon: "folder-down",
    meta: t("job.directoryImport.reading", { done: 0, total: files.length }),
    cancellable: true,
  });
  const failures: DirectoryImportFailure[] = [];
  const imported: Array<{ vaultPath: string; title: string }> = [];
  let processed = 0;

  for (const file of files) {
    if (job.cancelled) break;
    const path = directoryImportPath(file);
    try {
      job.update(
        t("job.directoryImport.readingFile", {
          done: processed + 1,
          total: files.length,
          path,
        }),
      );
      const content = await file.text();
      if (job.cancelled) break;
      const items = await prepareDirectoryImportItem(plugin, path, content, options.target, job);
      if (job.cancelled) break;
      if (items.length === 0) {
        failures.push({ path, message: t("job.directoryImport.noItems") });
        continue;
      }
      for (const item of items) {
        if (job.cancelled) break;
        try {
          job.update(
            t("job.directoryImport.writingFile", {
              done: processed + 1,
              total: files.length,
              path,
            }),
          );
          const note = await plugin.core.approveInboxItem(item.id, { target: options.target });
          imported.push({ vaultPath: note.vaultPath, title: note.title });
        } catch (e) {
          failures.push({
            path,
            message: e instanceof Error ? e.message : String(e),
            retained: true,
          });
        }
      }
    } catch (e) {
      failures.push({
        path,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      processed += 1;
      job.update(t("job.directoryImport.progress", { done: processed, total: files.length }));
    }
  }

  const status = job.cancelled ? "cancelled" : failures.length > 0 ? "failed" : "done";
  await appendJobHistory(plugin, {
    kind: "import-write",
    title: t("job.directoryImport.title"),
    status,
    startedAt: job.startedAt,
    finishedAt: Date.now(),
    summary: {
      directory: true,
      total: files.length,
      processed,
      imported: imported.length,
      failed: failures.length,
      retained: failures.filter((failure) => failure.retained).length,
      cancelled: job.cancelled,
    },
    failures: failures.map((failure) => ({
      path: failure.path,
      message: failure.message,
    })),
  });

  try {
    await plugin.openHubAndRefresh();
  } catch (e) {
    console.warn("[Aether Directory Import] Hub refresh failed:", e);
  }

  if (job.cancelled) {
    job.cancel(t("job.directoryImport.cancelled", { done: processed, total: files.length }), 8000);
  } else if (failures.length > 0) {
    job.fail(
      t("job.directoryImport.doneWithFailures", {
        imported: imported.length,
        total: files.length,
        failed: failures.length,
      }),
      9000,
    );
  } else {
    job.done(
      t("job.directoryImport.done", { imported: imported.length, total: files.length }),
      6000,
    );
  }
}

async function prepareDirectoryImportItem(
  plugin: AetherPlugin,
  path: string,
  content: string,
  target: ImportTarget,
  job: JobTracker,
): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  for await (const event of plugin.core.importSource(
    {
      kind: "file",
      label: path,
      payload: { type: "markdown-file", path, content },
    },
    {
      signal: job.signal,
      privacyTarget: target,
    },
  )) {
    if (job.cancelled) break;
    if (event.type === "item-added") {
      items.push(event.item);
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  }
  return items;
}

function normalizeImportPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}
