import { AetherError } from "../errors.js";
import type { IHostAdapter } from "../host/adapter.js";
import { parseDocument, serializeDocument } from "../markdown/frontmatter.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import type {
  ImportCategory,
  ImportOrganizeApplyResult,
  ImportOrganizePlan,
  ImportOrganizePlanItem,
  ImportOrganizePreviewOptions,
  Note,
  TokenUsage,
} from "../types.js";
import {
  findImportCategory,
  renderCategoryPromptList,
  resolveImportCategoryId,
} from "./categories.js";
import { buildUniqueOrganizedVaultPath, monthInRange, normalizeMonthFilter } from "./pathing.js";

export interface ImportOrganizerDeps {
  host: IHostAdapter;
  registry: ProviderRegistry;
  roles: RoleRegistry;
  categories: () => ImportCategory[];
  notes: () => Note[];
  reindexPath: (vaultPath: string, options?: { signal?: AbortSignal }) => Promise<Note | null>;
  removeStaleNote: (noteId: string) => Promise<void>;
  saveIndex: () => Promise<void>;
  onUsage?: (args: {
    providerId: string;
    feature: "inbox_metadata";
    model: string;
    usage: TokenUsage;
  }) => void | Promise<void>;
}

export class ImportOrganizer {
  constructor(private readonly deps: ImportOrganizerDeps) {}

  async preview(options: ImportOrganizePreviewOptions): Promise<ImportOrganizePlan> {
    const rootFolder = normalizeFolder(options.rootFolder);
    const fromMonth = normalizeMonthFilter(options.fromMonth);
    const toMonth = normalizeMonthFilter(options.toMonth);
    const categories = this.deps.categories();
    const items: ImportOrganizePlanItem[] = [];
    for (const note of this.deps.notes()) {
      throwIfAborted(options.signal);
      if (!isUnderFolder(note.vaultPath, rootFolder)) continue;
      if (!monthInRange(note.vaultPath, fromMonth, toMonth)) continue;
      const categoryId = await this.classifyNote(note, categories, options.signal);
      const category = findImportCategory(categories, categoryId);
      const targetPath = await buildUniqueOrganizedVaultPath({
        rootFolder,
        currentPath: note.vaultPath,
        categoryId,
        categories,
        host: this.deps.host,
      });
      if (targetPath === note.vaultPath) continue;
      items.push({
        noteId: note.id,
        currentPath: note.vaultPath,
        targetPath,
        title: note.title,
        categoryId,
        categoryLabel: category.label,
      });
    }
    return {
      id: this.deps.host.newId(),
      rootFolder,
      fromMonth,
      toMonth,
      items,
    };
  }

  async apply(
    plan: ImportOrganizePlan,
    options: { signal?: AbortSignal } = {},
  ): Promise<ImportOrganizeApplyResult> {
    const moved: ImportOrganizePlanItem[] = [];
    const failures: ImportOrganizeApplyResult["failures"] = [];
    for (const item of plan.items) {
      throwIfAborted(options.signal);
      try {
        await this.moveOne(item, options.signal);
        moved.push(item);
      } catch (e) {
        if (isAbortError(e)) throw e;
        failures.push({
          item,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await this.deps.saveIndex();
    return { moved, failures };
  }

  private async classifyNote(
    note: Note,
    categories: ImportCategory[],
    signal?: AbortSignal,
  ): Promise<string> {
    const prompt = [
      "你是个人知识库的导入整理助手。只根据标题、摘要、标签选择最合适的分类。",
      '仅返回单个 JSON 对象，键为 "categoryId"。',
      "可选分类：",
      renderCategoryPromptList(categories),
      "--- 元数据开始 ---",
      `title: ${note.title}`,
      `summary: ${note.summary ?? ""}`,
      `tags: ${note.tags.join(", ")}`,
      `kind: ${note.kind}`,
      "--- 元数据结束 ---",
    ].join("\n");
    try {
      const role = this.deps.roles.resolve("inbox_metadata");
      const provider = this.deps.registry.getProvider(role.providerId);
      let raw = "";
      let usage: TokenUsage | undefined;
      for await (const chunk of provider.chat({
        messages: [{ role: "user", content: prompt }],
        model: role.modelName,
        stream: true,
        temperature: 0.2,
        signal,
      })) {
        raw += chunk.delta;
        if (chunk.usage) {
          usage = usage
            ? {
                promptTokens: usage.promptTokens + chunk.usage.promptTokens,
                completionTokens: usage.completionTokens + chunk.usage.completionTokens,
              }
            : chunk.usage;
        }
      }
      if (usage) {
        await this.deps.onUsage?.({
          providerId: provider.id,
          feature: "inbox_metadata",
          model: role.modelName,
          usage,
        });
      }
      return resolveImportCategoryId(parseCategoryId(raw), categories);
    } catch (e) {
      if (isAbortError(e)) throw e;
      return "other";
    }
  }

  private async moveOne(item: ImportOrganizePlanItem, signal?: AbortSignal): Promise<void> {
    if (await this.deps.host.exists(item.targetPath)) {
      throw new AetherError("PARSE_ERROR", `Target path already exists: ${item.targetPath}`);
    }
    const raw = await this.deps.host.readFile(item.currentPath);
    throwIfAborted(signal);
    const parsed = parseDocument(raw);
    const next = serializeDocument(
      {
        ...parsed.frontmatter,
        aether_category: item.categoryId,
        aether_category_label: item.categoryLabel,
        aether_updated: this.deps.host.now(),
      },
      parsed.body,
    );
    const parent = item.targetPath.split("/").slice(0, -1).join("/");
    if (parent) await this.deps.host.ensureDir(parent);
    await this.deps.host.writeFile(item.targetPath, next);
    try {
      await this.deps.removeStaleNote(item.noteId);
      await this.deps.reindexPath(item.targetPath, { signal });
      await this.deps.host.deleteFile(item.currentPath);
    } catch (e) {
      if (await this.deps.host.exists(item.targetPath)) {
        await this.deps.host.deleteFile(item.targetPath);
      }
      await this.restoreOriginalIndex(item);
      throw e;
    }
  }

  private async restoreOriginalIndex(item: ImportOrganizePlanItem): Promise<void> {
    try {
      await this.deps.removeStaleNote(`path:${item.targetPath}`);
      if (await this.deps.host.exists(item.currentPath)) {
        await this.deps.reindexPath(item.currentPath);
      }
    } catch {
      // Best-effort rollback: keep the original move failure as the reported error.
    }
  }
}

function parseCategoryId(raw: string): string | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    return typeof obj.categoryId === "string" ? obj.categoryId : null;
  } catch {
    return null;
  }
}

function normalizeFolder(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function isUnderFolder(path: string, folder: string): boolean {
  if (!folder) return true;
  return path === folder || path.startsWith(`${folder}/`);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AetherError("ABORTED", "Aborted");
}

function isAbortError(e: unknown): boolean {
  if (e instanceof AetherError && e.code === "ABORTED") return true;
  return e instanceof Error && e.name === "AbortError";
}
