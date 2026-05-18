import { TokenUsageStore } from "./budget/token-usage.js";
import { BookmarksJsonConnector } from "./connectors/bookmarks-json-connector.js";
import { ITabConnector } from "./connectors/itab-connector.js";
import { MarkdownConnector } from "./connectors/markdown-connector.js";
import { NotionZipConnector } from "./connectors/notion-zip-connector.js";
import { PlainTextConnector } from "./connectors/plain-text-connector.js";
import { UrlListConnector } from "./connectors/url-list-connector.js";
import { AetherError } from "./errors.js";
import type { IHostAdapter } from "./host/adapter.js";
import { ImportPipeline, type ImportEvent } from "./import/pipeline.js";
import { InboxStore } from "./import/inbox-store.js";
import { OramaIndexStore } from "./index-store/orama-store.js";
import { chunkMarkdown } from "./markdown/chunker.js";
import { deriveTitle, parseDocument, serializeDocument } from "./markdown/frontmatter.js";
import { newUlid, slugify } from "./ids.js";
import { sha256Hex } from "./hash.js";
import { openAICompatibleFactory } from "./provider/openai-compatible.js";
import { ProviderRegistry } from "./provider/registry.js";
import { RoleRegistry } from "./roles/role-registry.js";
import { runRole } from "./roles/run-role.js";
import { SearchEngine } from "./search/search-engine.js";
import { SettingsStore } from "./persistence/settings-store.js";
import { extractKeyPoints } from "./ai/extract.js";
import { rewriteSelection } from "./ai/rewrite.js";
import { summarizeSelection } from "./ai/summarize.js";
import type {
  AiRole,
  Chunk,
  ImportSource,
  Note,
  PersistedIndex,
  PersistedSettings,
  SearchHit,
  SearchRequest,
  TestConnectionResult,
} from "./types.js";

const INDEX_KEY = "index.json";

export class AetherCore {
  readonly registry: ProviderRegistry;
  readonly roles: RoleRegistry;
  readonly store: OramaIndexStore;
  readonly inbox: InboxStore;
  readonly settings: SettingsStore;
  readonly usage = new TokenUsageStore();
  private readonly searchEngine: SearchEngine;
  private readonly pipeline: ImportPipeline;
  private staleCount = 0;
  private embeddingDim = 8;
  private embeddingModel: string | null = null;

  constructor(private readonly host: IHostAdapter) {
    this.registry = new ProviderRegistry({
      factories: [openAICompatibleFactory],
      fetch: (i, init) => host.fetch(i, init),
    });
    this.roles = new RoleRegistry();
    this.store = new OramaIndexStore({ embeddingDim: this.embeddingDim });
    this.inbox = new InboxStore(host);
    this.settings = new SettingsStore(host);
    this.searchEngine = new SearchEngine({
      registry: this.registry,
      roles: this.roles,
      store: this.store,
      getStaleRatio: () => {
        const total = this.store.allChunks().length;
        return total === 0 ? 0 : this.staleCount / total;
      },
    });
    this.pipeline = new ImportPipeline({
      host,
      registry: this.registry,
      roles: this.roles,
      store: this.store,
      inbox: this.inbox,
      connectors: [
        new MarkdownConnector(),
        new PlainTextConnector(),
        new NotionZipConnector(),
        new BookmarksJsonConnector(),
        new UrlListConnector(),
        new ITabConnector(),
      ],
    });
  }

  async init(): Promise<void> {
    await this.store.init();
    const settings = await this.settings.load();
    this.applySettings(settings);
    await this.inbox.load();
    await this.loadIndex();
  }

  applySettings(s: PersistedSettings): void {
    this.registry.setConfigs(s.providers);
    this.registry.setBindings(s.bindings);
    this.registry.setApiKeys(s.apiKeys);
    this.roles.setRoles(s.roles);
  }

  /**
   * Validate a provider configuration by listing its models. Does not require
   * a feature binding — useful for the settings UI's "Test" button before
   * bindings have been chosen.
   */
  async testProvider(providerId: string): Promise<TestConnectionResult> {
    try {
      const provider = this.registry.getProvider(providerId);
      return await provider.testConnection();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  }

  // ---- Import ----
  importSource(source: ImportSource): AsyncIterable<ImportEvent> {
    return this.pipeline.run(source);
  }

  async approveInboxItem(itemId: string): Promise<Note> {
    const item = this.inbox.getItem(itemId);
    if (!item) throw new AetherError("PARSE_ERROR", `Inbox item not found: ${itemId}`);
    const settings = this.settings.current;
    const folder = settings.ui.aetherInboxFolder.replace(/\/+$/, "");
    const d = new Date(this.host.now());
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const subdir = item.kind === "bookmark" ? "bookmarks" : "notes";
    const slug = slugify(item.proposedTitle).slice(0, 40) || "untitled";
    const vaultPath = `${folder}/${subdir}/${year}/${month}/${item.id.slice(0, 10)}-${slug}.md`;
    const noteId = newUlid();
    const fm = {
      aether_id: noteId,
      aether_kind: item.kind,
      title: item.proposedTitle,
      tags: item.proposedTags,
      aether_summary: item.proposedSummary || null,
      aether_source: "import" as const,
      aether_url: item.url,
      aether_created: this.host.now(),
      aether_updated: this.host.now(),
    };
    const body =
      item.kind === "bookmark" && item.url
        ? `[${item.proposedTitle}](${item.url})\n\n${item.content}`
        : item.content;
    const md = serializeDocument(fm, body);
    const parent = vaultPath.split("/").slice(0, -1).join("/");
    if (parent) await this.host.ensureDir(parent);
    await this.host.writeFile(vaultPath, md);
    const contentHash = await sha256Hex(md);
    const note: Note = {
      id: noteId,
      vaultPath,
      kind: item.kind,
      title: item.proposedTitle,
      summary: item.proposedSummary || null,
      tags: item.proposedTags,
      url: item.url,
      source: "import",
      sourceMeta: { batchId: item.batchId, originalSourceRef: item.sourceRef },
      createdAt: this.host.now(),
      updatedAt: this.host.now(),
      contentHash,
      indexState: "indexing",
    };
    this.store.upsertNote(note);
    await this.reindexNote(note, body);
    this.inbox.updateStatus(itemId, "approved");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
    await this.saveIndex();
    return note;
  }

  async discardInboxItem(itemId: string): Promise<void> {
    const item = this.inbox.getItem(itemId);
    if (!item) return;
    this.inbox.updateStatus(itemId, "discarded");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
  }

  async mergeInboxItem(itemId: string, intoNoteId: string): Promise<Note> {
    const item = this.inbox.getItem(itemId);
    if (!item) throw new AetherError("PARSE_ERROR", `Inbox item not found: ${itemId}`);
    const target = this.store.getNote(intoNoteId);
    if (!target) throw new AetherError("PARSE_ERROR", `Target note not found: ${intoNoteId}`);
    const raw = await this.host.readFile(target.vaultPath);
    const parsed = parseDocument(raw);
    const updatedBody = `${parsed.body.trimEnd()}\n\n---\n\n${item.content}`;
    const updatedFm = { ...parsed.frontmatter, aether_updated: this.host.now() };
    const next = serializeDocument(updatedFm, updatedBody);
    await this.host.writeFile(target.vaultPath, next);
    const contentHash = await sha256Hex(next);
    const updated: Note = {
      ...target,
      updatedAt: this.host.now(),
      contentHash,
      indexState: "indexing",
    };
    this.store.upsertNote(updated);
    await this.reindexNote(updated, updatedBody);
    this.inbox.updateStatus(itemId, "merged");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
    await this.saveIndex();
    return updated;
  }

  // ---- Search ----
  search(req: SearchRequest): Promise<SearchHit[]> {
    return this.searchEngine.search(req);
  }

  // ---- AI helpers ----
  rewrite(selection: string, style?: "concise" | "polished" | "neutral"): Promise<string> {
    return rewriteSelection({
      registry: this.registry,
      roles: this.roles,
      selection,
      ...(style ? { style } : {}),
    });
  }
  summarize(selection: string): Promise<string> {
    return summarizeSelection({ registry: this.registry, roles: this.roles, selection });
  }
  extract(selection: string): Promise<string[]> {
    return extractKeyPoints({ registry: this.registry, roles: this.roles, selection });
  }

  /**
   * 通用角色调用入口：用任意 Role（包括用户自定义）跑一次。
   * UI 层（编辑器右键、角色编辑器测试按钮）应优先调这个，而不是上面的内置 wrapper。
   */
  async runRole(
    roleId: string,
    vars: Record<string, string | number>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const opts: Parameters<typeof runRole>[0] = {
      registry: this.registry,
      roles: this.roles,
      roleId,
      vars,
    };
    if (signal) opts.signal = signal;
    const r = await runRole(opts);
    return r.output;
  }

  /** 列出可在编辑器右键菜单中展示的 Roles。 */
  listEditorRoles(): AiRole[] {
    return this.roles.listForEditor();
  }

  // ---- Indexing ----
  async indexExistingVaultFile(vaultPath: string): Promise<Note | null> {
    const raw = await this.host.readFile(vaultPath);
    const parsed = parseDocument(raw);
    const fmId =
      typeof parsed.frontmatter.aether_id === "string" ? parsed.frontmatter.aether_id : null;
    const id = fmId ?? `path:${vaultPath}`;
    const title = deriveTitle(parsed, vaultPath);
    const tags = Array.isArray(parsed.frontmatter.tags)
      ? parsed.frontmatter.tags.filter((t): t is string => typeof t === "string")
      : [];
    const url =
      typeof parsed.frontmatter["aether_url"] === "string"
        ? (parsed.frontmatter["aether_url"] as string)
        : null;
    const kind = parsed.frontmatter.aether_kind === "bookmark" ? "bookmark" : "note";
    const summary =
      typeof parsed.frontmatter["aether_summary"] === "string"
        ? (parsed.frontmatter["aether_summary"] as string)
        : null;
    const contentHash = await sha256Hex(raw);
    const note: Note = {
      id,
      vaultPath,
      kind,
      title,
      summary,
      tags,
      url,
      source: "manual",
      sourceMeta: { hasAetherId: fmId !== null, malformed: parsed.malformed },
      createdAt: this.host.now(),
      updatedAt: this.host.now(),
      contentHash,
      indexState: "indexing",
    };
    this.store.upsertNote(note);
    await this.reindexNote(note, parsed.body);
    return note;
  }

  async rebuildAll(): Promise<{ scanned: number; indexed: number }> {
    const scope = this.settings.current.ui.scanScope;
    const folder = scope === "vault" ? "" : this.settings.current.ui.aetherInboxFolder;

    // —— 重要：先用一次小 probe 确认 embedding 维度，再清空 store。
    // 否则切换 embedding 模型（如 dim 8 → 2560）后再重建，老 chunks 残留导致
    // 后续搜索抛 EMBED_DIM_MISMATCH。
    try {
      const role = this.roles.resolve("embedding");
      const provider = this.registry.getProvider(role.providerId);
      const probe = await provider.embed({ inputs: ["dim probe"], model: role.modelName });
      if (probe.dim !== this.embeddingDim) {
        this.embeddingDim = probe.dim;
        await this.store.setEmbeddingDim(probe.dim); // 这会清空 chunks 重建 schema
      } else {
        // 维度未变，但仍然把 chunks 清掉，确保 rebuild 是真的「全量重建」
        await this.store.setEmbeddingDim(probe.dim);
      }
      this.embeddingModel = probe.model;
    } catch {
      // 没绑 embedding 也照样允许 rebuild —— 走 BM25-only 模式。
      // 但若旧索引维度 > 0，把它降回 8 以避免后续混乱。
      await this.store.setEmbeddingDim(this.embeddingDim);
    }

    const files = await this.host.listMarkdown(folder);
    let indexed = 0;
    for (const f of files) {
      try {
        if (await this.indexExistingVaultFile(f.path)) indexed += 1;
      } catch {
        // Tolerant rebuild: skip individual failures so one bad file doesn't abort the whole rebuild.
      }
    }
    await this.saveIndex();
    return { scanned: files.length, indexed };
  }

  private async reindexNote(note: Note, body: string): Promise<void> {
    const chunks = chunkMarkdown(body);
    let resolvedEmbeddings: number[][] = chunks.map(() =>
      new Array<number>(this.embeddingDim).fill(0),
    );
    try {
      const role = this.roles.resolve("embedding");
      const provider = this.registry.getProvider(role.providerId);
      const model = role.modelName;
      if (chunks.length > 0) {
        const inputs = chunks.map((c) => c.content);
        const embed = await provider.embed({ inputs, model });
        if (this.embeddingModel !== null && this.embeddingModel !== model) {
          this.host.notify(
            `Embedding model changed (${this.embeddingModel} → ${model}). Run "Rebuild index" to re-embed prior notes.`,
            { level: "warn", timeoutMs: 0 },
          );
        }
        if (embed.dim !== this.embeddingDim) {
          if (this.store.allChunks().length > 0) {
            throw new AetherError(
              "EMBED_DIM_MISMATCH",
              `Provider returned dim ${embed.dim} but existing index uses ${this.embeddingDim}. Run "Rebuild index" after switching models.`,
            );
          }
          this.embeddingDim = embed.dim;
          await this.store.setEmbeddingDim(embed.dim);
        }
        this.embeddingModel = model;
        resolvedEmbeddings = embed.vectors;
        if (embed.usage) {
          this.usage.record({
            providerId: provider.id,
            feature: "embedding",
            model,
            usage: embed.usage,
          });
        }
      }
    } catch (e) {
      if (
        e instanceof AetherError &&
        (e.code === "BINDING_NOT_FOUND" || e.code === "API_KEY_MISSING")
      ) {
        // Skip embedding; index BM25-only.
      } else {
        throw e;
      }
    }
    const chunkRows: Chunk[] = chunks.map((c, i) => ({
      id: newUlid(),
      noteId: note.id,
      ordinal: c.ordinal,
      headingPath: c.headingPath,
      content: c.content,
      tokenCount: c.approxTokens,
      embeddingModel: this.embeddingModel,
      embedding: resolvedEmbeddings[i] ?? new Array<number>(this.embeddingDim).fill(0),
    }));
    await this.store.setChunks(note.id, chunkRows);
    this.store.upsertNote({ ...note, indexState: "fresh" });
  }

  private async loadIndex(): Promise<void> {
    const raw = await this.host.readData(INDEX_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as PersistedIndex;
      const dim = payload.embeddingDim ?? this.embeddingDim;
      if (dim !== this.embeddingDim) {
        this.embeddingDim = dim;
        await this.store.setEmbeddingDim(dim);
      }
      this.embeddingModel = payload.embeddingModel;
      for (const n of payload.notes) this.store.upsertNote(n);
      const byNote = new Map<string, Chunk[]>();
      for (const c of payload.chunks) {
        const arr = byNote.get(c.noteId) ?? [];
        arr.push(c);
        byNote.set(c.noteId, arr);
      }
      for (const [noteId, chunks] of byNote) {
        await this.store.setChunks(noteId, chunks);
      }
    } catch {
      this.host.notify("Index corrupt; please rebuild from settings", {
        level: "warn",
        timeoutMs: 0,
      });
    }
  }

  async saveIndex(): Promise<void> {
    const payload: PersistedIndex = {
      schemaVersion: 1,
      embeddingModel: this.embeddingModel,
      embeddingDim: this.embeddingDim,
      notes: this.store.allNotes(),
      chunks: this.store.allChunks().map((c) => ({ ...c, embeddingModel: this.embeddingModel })),
      updatedAt: this.host.now(),
    };
    await this.host.writeData(INDEX_KEY, JSON.stringify(payload));
  }
}
