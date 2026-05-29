import { AetherError } from "../errors.js";
import type { IHostAdapter } from "../host/adapter.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import type { OramaIndexStore } from "../index-store/orama-store.js";
import { proposeMetadata } from "../ai/metadata.js";
import { detectDuplicate } from "./duplicate-detector.js";
import type { InboxStore } from "./inbox-store.js";
import { DEFAULT_IMPORT_CATEGORIES } from "./categories.js";
import type {
  Feature,
  ImportCategory,
  ImportSource,
  InboxItem,
  RawCandidate,
  TokenUsage,
} from "../types.js";
import type { SourceConnector } from "../connectors/connector.js";
import { normalizeUrl } from "../url-normalize.js";

export type ImportEvent =
  | { type: "batch-started"; batchId: string; sourceLabel: string }
  | { type: "item-added"; item: InboxItem }
  | { type: "batch-truncated"; batchId: string; imported: number; cap: number }
  | { type: "batch-finished"; batchId: string; total: number }
  | { type: "error"; message: string };

export interface ImportPipelineDeps {
  host: IHostAdapter;
  registry: ProviderRegistry;
  roles: RoleRegistry;
  store: OramaIndexStore;
  inbox: InboxStore;
  connectors: SourceConnector[];
  /** Max items before pausing the AI metadata step. Default 200. */
  maxItemsPerBatch?: number;
  getImportCategories?: () => ImportCategory[];
  onUsage?: (args: {
    providerId: string;
    feature: Feature;
    model: string;
    usage: TokenUsage;
  }) => void | Promise<void>;
  /** 私密导入时，给指定 feature 提供覆盖路由；null 表示不允许远程调用。 */
  resolvePrivateRoute?: (
    feature: "inbox_metadata" | "embedding",
  ) => { providerId: string; modelName: string } | null;
}

export interface ImportPipelineRunOptions {
  signal?: AbortSignal;
  privacyTarget?: "public" | "private";
}

export class ImportPipeline {
  constructor(private readonly deps: ImportPipelineDeps) {}

  async *run(
    source: ImportSource,
    options: ImportPipelineRunOptions = {},
  ): AsyncIterable<ImportEvent> {
    const connector = this.deps.connectors.find((c) => c.canHandle(source));
    if (!connector) {
      yield { type: "error", message: `No connector for source: ${source.payload.type}` };
      return;
    }

    const batchId = this.deps.host.newId();
    this.deps.inbox.createBatch({
      id: batchId,
      sourceLabel: source.label,
      totalItems: 0,
    });
    yield { type: "batch-started", batchId, sourceLabel: source.label };

    let count = 0;
    const cap = this.deps.maxItemsPerBatch ?? 200;
    try {
      for await (const candidate of connector.parse(source)) {
        throwIfAborted(options.signal);
        if (count >= cap) {
          yield { type: "batch-truncated", batchId, imported: count, cap };
          break;
        }
        try {
          const item = await this.toInboxItem(candidate, batchId, options);
          if (!item) continue;
          this.deps.inbox.addItem(item);
          count += 1;
          yield { type: "item-added", item };
        } catch (e) {
          if (isAbortError(e)) throw e;
          const msg = e instanceof Error ? e.message : String(e);
          yield { type: "error", message: `Failed to process item: ${msg}` };
          // Continue processing other items
        }
      }

      await this.deps.inbox.save();
      yield { type: "batch-finished", batchId, total: count };
    } catch (e) {
      if (isAbortError(e)) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: "error", message: `Import pipeline error: ${msg}` };
    }
  }

  private async toInboxItem(
    candidate: RawCandidate,
    batchId: string,
    options: ImportPipelineRunOptions = {},
  ): Promise<InboxItem | null> {
    throwIfAborted(options.signal);
    if (isExistingUrlBookmark(this.deps.store.allNotes(), this.deps.inbox.listItems(), candidate)) {
      return null;
    }
    const fallbackTitle = candidate.sourceRef.split("/").pop()?.replace(/\.md$/i, "") ?? "Untitled";
    const categories = this.deps.getImportCategories?.() ?? DEFAULT_IMPORT_CATEGORIES;
    let proposal;
    if (isUrlOnlyBookmark(candidate)) {
      proposal = {
        title: candidate.title?.trim() || titleFromUrl(candidate.url) || fallbackTitle,
        tags: candidate.tags,
        summary: "",
        categoryId: "other",
      };
    } else {
      try {
        const metadataRoute =
          options.privacyTarget === "private"
            ? (this.deps.resolvePrivateRoute?.("inbox_metadata") ?? null)
            : null;
        if (options.privacyTarget === "private" && !metadataRoute) {
          proposal = {
            title: fallbackTitle,
            tags: candidate.tags,
            summary: "",
            categoryId: "other",
          };
        } else {
          proposal = await proposeMetadata({
            registry: this.deps.registry,
            roles: this.deps.roles,
            candidate,
            fallbackTitle,
            categories,
            providerOverride: metadataRoute ?? undefined,
            onUsage: this.deps.onUsage,
            signal: options.signal,
          });
        }
      } catch (e) {
        if (isAbortError(e)) throw e;
        // proposeMetadata should handle errors internally, but catch just in case
        console.warn("[Aether] proposeMetadata failed, using fallback:", e);
        proposal = {
          title: fallbackTitle,
          tags: candidate.tags,
          summary: "",
          categoryId: "other",
        };
      }
    }
    let duplicateOf: string | null = null;
    if (candidate.content.trim().length > 0) {
      try {
        throwIfAborted(options.signal);
        const embeddingRoute =
          options.privacyTarget === "private"
            ? (this.deps.resolvePrivateRoute?.("embedding") ?? null)
            : null;
        if (options.privacyTarget === "private" && !embeddingRoute) {
          return {
            id: this.deps.host.newId(),
            batchId,
            sourceKind: "file",
            sourceRef: candidate.sourceRef,
            proposedTitle: proposal.title,
            proposedTags: proposal.tags.length > 0 ? proposal.tags : candidate.tags,
            proposedSummary: proposal.summary,
            proposedCategoryId: proposal.categoryId,
            content: candidate.content,
            kind: candidate.kind,
            url: candidate.url,
            duplicateOf: null,
            status: "pending",
            createdAt: this.deps.host.now(),
            decidedAt: null,
          };
        }
        const role = this.deps.roles.resolve("embedding");
        const providerId = embeddingRoute?.providerId ?? role.providerId;
        const modelName = embeddingRoute?.modelName ?? role.modelName;
        const provider = this.deps.registry.getProvider(providerId);
        const embedded = await provider.embed({
          inputs: [candidate.content.slice(0, 2000)],
          model: modelName,
          signal: options.signal,
        });
        if (embedded.usage) {
          await this.deps.onUsage?.({
            providerId: provider.id,
            feature: "embedding",
            model: modelName,
            usage: embedded.usage,
          });
        }
        const vector = embedded.vectors[0] ?? [];
        duplicateOf = await detectDuplicate({
          store: this.deps.store,
          content: candidate.content,
          vector,
        });
      } catch (e) {
        if (isAbortError(e)) throw e;
        if (
          e instanceof AetherError &&
          e.code !== "BINDING_NOT_FOUND" &&
          e.code !== "API_KEY_MISSING" &&
          e.code !== "PROVIDER_CONFIG_INVALID"
        ) {
          console.warn("[Aether] Duplicate detection failed:", e);
        }
        // No embedding available — skip dup detection.
      }
    }
    const item: InboxItem = {
      id: this.deps.host.newId(),
      batchId,
      sourceKind: "file",
      sourceRef: candidate.sourceRef,
      proposedTitle: proposal.title,
      proposedTags: proposal.tags.length > 0 ? proposal.tags : candidate.tags,
      proposedSummary: proposal.summary,
      proposedCategoryId: proposal.categoryId,
      content: candidate.content,
      kind: candidate.kind,
      url: candidate.url,
      duplicateOf,
      status: "pending",
      createdAt: this.deps.host.now(),
      decidedAt: null,
    };
    return item;
  }
}

function isUrlOnlyBookmark(candidate: RawCandidate): boolean {
  return candidate.kind === "bookmark" && !!candidate.url && candidate.content.trim().length === 0;
}

function isExistingUrlBookmark(
  notes: Array<{ kind: string; url: string | null }>,
  inboxItems: Array<{ kind: string; url: string | null; status: string }>,
  candidate: RawCandidate,
): boolean {
  if (!candidate.url || candidate.kind !== "bookmark") return false;
  const normalized = normalizeUrl(candidate.url);
  return (
    notes.some(
      (note) => note.kind === "bookmark" && note.url && normalizeUrl(note.url) === normalized,
    ) ||
    inboxItems.some(
      (item) =>
        item.status === "pending" &&
        item.kind === "bookmark" &&
        item.url !== null &&
        normalizeUrl(item.url) === normalized,
    )
  );
}

function titleFromUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const tail = url.pathname.split("/").filter(Boolean).at(-1);
    return decodeURIComponent(tail || url.hostname);
  } catch {
    return raw;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AetherError("ABORTED", "Aborted");
}

function isAbortError(e: unknown): boolean {
  if (e instanceof AetherError && e.code === "ABORTED") return true;
  return e instanceof Error && e.name === "AbortError";
}
