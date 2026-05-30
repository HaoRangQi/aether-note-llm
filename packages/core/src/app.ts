import { TokenUsageStore, type UsageEntry } from "./budget/token-usage.js";
import { BookmarksJsonConnector } from "./connectors/bookmarks-json-connector.js";
import { ITabConnector } from "./connectors/itab-connector.js";
import { MarkdownConnector } from "./connectors/markdown-connector.js";
import { NotionZipConnector } from "./connectors/notion-zip-connector.js";
import { PlainTextConnector } from "./connectors/plain-text-connector.js";
import { UrlListConnector } from "./connectors/url-list-connector.js";
import { AetherError } from "./errors.js";
import type { IHostAdapter, VaultFileMeta } from "./host/adapter.js";
import {
  ImportPipeline,
  type ImportEvent,
  type ImportPipelineRunOptions,
} from "./import/pipeline.js";
import { InboxStore } from "./import/inbox-store.js";
import { findImportCategory, resolveImportCategoryId } from "./import/categories.js";
import { ImportOrganizer } from "./import/organizer.js";
import { buildUniqueImportVaultPath } from "./import/pathing.js";
import { OramaIndexStore } from "./index-store/orama-store.js";
import { chunkMarkdown } from "./markdown/chunker.js";
import { deriveTitle, parseDocument, serializeDocument } from "./markdown/frontmatter.js";
import { newUlid, slugify } from "./ids.js";
import { sha256Hex } from "./hash.js";
import { openAICompatibleFactory } from "./provider/openai-compatible.js";
import { ProviderRegistry } from "./provider/registry.js";
import { RoleRegistry } from "./roles/role-registry.js";
import { runRole } from "./roles/run-role.js";
import { SearchEngine, type SearchRunOptions } from "./search/search-engine.js";
import { SettingsStore } from "./persistence/settings-store.js";
import type {
  AiRole,
  Chunk,
  ExperienceCardDraft,
  Feature,
  InboxItem,
  IndexHealth,
  IndexHealthNote,
  IndexRefreshOptions,
  IndexRefreshFailure,
  IndexRefreshResult,
  ImportOrganizeApplyResult,
  ImportOrganizePlan,
  ImportOrganizePreviewOptions,
  ImportSource,
  Note,
  PersistedIndex,
  PersistedSettings,
  ProblemConfidence,
  ProblemEvidenceStatus,
  ProblemSolution,
  ProblemSolveRequest,
  ProblemSolveResponse,
  RebuildOptions,
  RebuildResult,
  SearchAnswerCitation,
  SearchAnswerCitationCheck,
  SearchAnswerRequest,
  SearchAnswerResponse,
  SearchHit,
  PrivacyScope,
  SearchRequest,
  SearchResponse,
  TestConnectionResult,
  TokenUsage,
} from "./types.js";

const INDEX_KEY = "index.json";
const USAGE_KEY = "usage.json";
const DEFAULT_ANSWER_CONTEXT_TOKENS = 1800;
const SEARCH_SCOPE_OVERSCAN_MULTIPLIER = 6;

type RouteFeature = "embedding" | "inbox_metadata" | "answer" | "solve" | "chat";

interface ProviderModelRoute {
  providerId: string;
  modelName: string;
}

interface RoleBindingRoute extends ProviderModelRoute {
  outputKind?: string;
  privateProviderId?: string;
  privateModelName?: string;
}

export class AetherCore {
  readonly registry: ProviderRegistry;
  readonly roles: RoleRegistry;
  readonly store: OramaIndexStore;
  readonly inbox: InboxStore;
  readonly settings: SettingsStore;
  readonly usage: TokenUsageStore;
  private readonly searchEngine: SearchEngine;
  private readonly pipeline: ImportPipeline;
  private readonly organizer: ImportOrganizer;
  private staleCount = 0;
  private embeddingDim = 8;
  private embeddingModel: string | null = null;
  private indexMutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly host: IHostAdapter) {
    this.usage = new TokenUsageStore(() => host.now());
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
        const notesInScope = new Set(
          this.store
            .allNotes()
            .filter((note) => this.isPathInCurrentScanScope(note.vaultPath))
            .map((note) => note.id),
        );
        const total = this.store
          .allChunks()
          .filter((chunk) => notesInScope.has(chunk.noteId)).length;
        return total === 0 ? 0 : this.staleCount / total;
      },
      onUsage: (args) => this.recordUsage(args),
    });
    this.pipeline = new ImportPipeline({
      host,
      registry: this.registry,
      roles: this.roles,
      store: this.store,
      inbox: this.inbox,
      getImportCategories: () => this.settings.current.importing.categories,
      onUsage: (args) => this.recordUsage(args),
      resolvePrivateRoute: (feature) => this.resolvePrivateRoute(feature),
      connectors: [
        new MarkdownConnector(),
        new PlainTextConnector(),
        new NotionZipConnector(),
        new BookmarksJsonConnector(),
        new UrlListConnector(),
        new ITabConnector(),
      ],
    });
    this.organizer = new ImportOrganizer({
      host,
      registry: this.registry,
      roles: this.roles,
      categories: () => this.settings.current.importing.categories,
      notes: () => this.store.allNotes(),
      reindexPath: (vaultPath, options) => this.indexExistingVaultFile(vaultPath, options),
      removeStaleNote: (noteId) => this.store.removeNote(noteId),
      saveIndex: () => this.saveIndex(),
      onUsage: (args) => this.recordUsage(args),
    });
  }

  async init(): Promise<void> {
    await this.store.init();
    const settings = await this.settings.load();
    this.applySettings(settings);
    await this.inbox.load();
    await this.loadIndex();
    await this.loadUsage();
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
  importSource(
    source: ImportSource,
    options: ImportPipelineRunOptions = {},
  ): AsyncIterable<ImportEvent> {
    if (options.privacyTarget) {
      void this.rememberImportTarget(options.privacyTarget).catch(() => undefined);
    }
    return this.pipeline.run(source, options);
  }

  async approveInboxItem(
    itemId: string,
    options: { target?: "public" | "private" } = {},
  ): Promise<Note> {
    const item = this.inbox.getItem(itemId);
    if (!item) throw new AetherError("PARSE_ERROR", `Inbox item not found: ${itemId}`);
    const settings = this.settings.current;
    const target = options.target ?? "public";
    await this.rememberImportTarget(target);
    const folder =
      target === "private"
        ? settings.privacy.privateInboxFolder.replace(/\/+$/, "")
        : settings.ui.aetherInboxFolder.replace(/\/+$/, "");
    const categoryId = resolveImportCategoryId(
      item.proposedCategoryId,
      settings.importing.categories,
    );
    const category = findImportCategory(settings.importing.categories, categoryId);
    const vaultPath = await buildUniqueImportVaultPath({
      rootFolder: folder,
      itemId: item.id,
      title: item.proposedTitle,
      categoryId,
      categories: settings.importing.categories,
      now: this.host.now(),
      host: this.host,
    });
    const noteId = newUlid();
    const fm = {
      aether_id: noteId,
      aether_kind: item.kind,
      title: item.proposedTitle,
      tags: item.proposedTags,
      aether_summary: item.proposedSummary || null,
      aether_category: category.id,
      aether_category_label: category.label,
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
    try {
      await this.reindexNote(note, body);
    } catch (e) {
      await this.store.removeNote(note.id);
      await this.host.deleteFile(vaultPath);
      throw e;
    }
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

  async updateInboxItemDraft(
    itemId: string,
    patch: Partial<
      Pick<InboxItem, "proposedTitle" | "proposedSummary" | "proposedTags" | "proposedCategoryId">
    >,
  ): Promise<void> {
    const next = this.inbox.updateDraft(itemId, {
      ...(patch.proposedTitle !== undefined
        ? { proposedTitle: patch.proposedTitle.trim().slice(0, 120) }
        : {}),
      ...(patch.proposedSummary !== undefined
        ? { proposedSummary: patch.proposedSummary.trim().slice(0, 500) }
        : {}),
      ...(patch.proposedTags !== undefined
        ? {
            proposedTags: patch.proposedTags
              .map((tag) => tag.trim().replace(/^#/, ""))
              .filter((tag, idx, arr) => tag.length > 0 && arr.indexOf(tag) === idx)
              .slice(0, 12),
          }
        : {}),
      ...(patch.proposedCategoryId !== undefined
        ? {
            proposedCategoryId: resolveImportCategoryId(
              patch.proposedCategoryId,
              this.settings.current.importing.categories,
            ),
          }
        : {}),
    });
    if (!next)
      throw new AetherError("PARSE_ERROR", `Inbox item not found or not pending: ${itemId}`);
    await this.inbox.save();
  }

  async previewOrganizeImports(options: ImportOrganizePreviewOptions): Promise<ImportOrganizePlan> {
    return this.organizer.preview(options);
  }

  async applyOrganizeImports(
    plan: ImportOrganizePlan,
    options: { signal?: AbortSignal } = {},
  ): Promise<ImportOrganizeApplyResult> {
    return this.organizer.apply(plan, options);
  }

  async mergeInboxItem(itemId: string, intoNoteId: string): Promise<Note> {
    const item = this.inbox.getItem(itemId);
    if (!item) throw new AetherError("PARSE_ERROR", `Inbox item not found: ${itemId}`);
    const target = this.store.getNote(intoNoteId);
    if (!target) throw new AetherError("PARSE_ERROR", `Target note not found: ${intoNoteId}`);
    const raw = await this.host.readFile(target.vaultPath);
    const previousChunks = this.store.chunksForNote(target.id);
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
    try {
      await this.reindexNote(updated, updatedBody);
    } catch (e) {
      await this.host.writeFile(target.vaultPath, raw);
      this.store.upsertNote(target);
      await this.store.setChunks(target.id, previousChunks);
      throw e;
    }
    this.inbox.updateStatus(itemId, "merged");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
    await this.saveIndex();
    return updated;
  }

  async deleteNote(noteId: string): Promise<void> {
    const note = this.store.getNote(noteId);
    if (!note) return;
    await this.host.deleteFile(note.vaultPath);
    await this.store.removeNote(noteId);
    await this.saveIndex();
  }

  // ---- Search ----
  async search(req: SearchRequest): Promise<SearchHit[]> {
    return (await this.searchWithMeta(req)).hits;
  }

  async searchWithMeta(req: SearchRequest): Promise<SearchResponse> {
    const scopedReq = this.withCurrentScanScope(req);
    const privacyScope = this.resolvePrivacyScope(req.privacyScope);
    const requestedLimit = scopedReq.limit ?? 20;
    const overscanLimit =
      privacyScope === "all"
        ? requestedLimit
        : Math.max(requestedLimit * SEARCH_SCOPE_OVERSCAN_MULTIPLIER, requestedLimit);
    const result = await this.searchEngine.searchWithMeta(
      {
        ...scopedReq,
        limit: overscanLimit,
      },
      this.searchOptionsForScope(privacyScope),
    );
    return {
      ...result,
      hits: this.filterSearchHitsByPrivacyScope(result.hits, privacyScope).slice(0, requestedLimit),
    };
  }

  async answerSearch(req: SearchAnswerRequest): Promise<SearchAnswerResponse> {
    const privacyScope = this.resolvePrivacyScope(req.privacyScope);
    const search =
      (req.search
        ? this.filterSearchResponseByPrivacyScope(
            this.filterSearchResponseToCurrentScanScope(req.search),
            privacyScope,
          )
        : undefined) ??
      (await this.searchWithMeta({
        query: req.query,
        filters: req.filters,
        limit: req.limit ?? 8,
        privacyScope,
      }));
    const isolatedHits = this.isolateAnswerHitsByDomain(search.hits, privacyScope);
    const scopedSearch: SearchResponse = { ...search, hits: isolatedHits };
    const contextBudget = Math.max(
      1,
      Math.floor(req.maxContextTokens ?? DEFAULT_ANSWER_CONTEXT_TOKENS),
    );
    const contextChunks = selectAnswerContext(
      isolatedHits,
      req.maxContextChunks ?? 6,
      contextBudget,
    );
    const citations: SearchAnswerCitation[] = contextChunks.map((item, idx) => ({
      index: idx + 1,
      noteId: item.hit.noteId,
      vaultPath: item.hit.vaultPath,
      title: item.hit.title,
      chunkId: item.chunk.chunkId,
      headingPath: item.chunk.headingPath,
      excerpt: item.chunk.excerpt,
      url: item.hit.url,
      tokenCount: item.tokenCount,
      truncated: item.truncated,
    }));
    const contextTokenCount = contextChunks.reduce((sum, item) => sum + item.tokenCount, 0);
    const contextTruncated =
      contextChunks.some((item) => item.truncated) ||
      hasMoreAnswerContext(isolatedHits, contextChunks);
    if (contextChunks.length === 0) {
      return {
        question: req.query,
        answer: "",
        citations,
        citationCheck: checkAnswerCitations("", citations),
        contextTokenCount,
        contextTruncated,
        search: scopedSearch,
      };
    }
    const context = contextChunks
      .map((item, idx) => formatAnswerContextItem(idx + 1, item))
      .join("\n\n");
    const output = await this.runRole(
      "answer",
      { question: req.query, context },
      req.signal,
      contextChunks[0]?.hit.vaultPath,
    );
    return {
      question: req.query,
      answer: String(output ?? "").trim(),
      citations,
      citationCheck: checkAnswerCitations(String(output ?? ""), citations),
      contextTokenCount,
      contextTruncated,
      search: scopedSearch,
    };
  }

  async solveProblem(req: ProblemSolveRequest): Promise<ProblemSolveResponse> {
    const privacyScope = this.resolvePrivacyScope(req.privacyScope);
    const search =
      (req.search
        ? this.filterSearchResponseByPrivacyScope(
            this.filterSearchResponseToCurrentScanScope(req.search),
            privacyScope,
          )
        : undefined) ??
      (await this.searchWithMeta({
        query: req.question,
        filters: req.filters,
        limit: req.limit ?? 8,
        privacyScope,
      }));
    const isolatedHits = this.isolateAnswerHitsByDomain(search.hits, privacyScope);
    const scopedSearch: SearchResponse = { ...search, hits: isolatedHits };
    const contextBudget = Math.max(
      1,
      Math.floor(req.maxContextTokens ?? DEFAULT_ANSWER_CONTEXT_TOKENS),
    );
    const contextChunks = selectAnswerContext(
      isolatedHits,
      req.maxContextChunks ?? 6,
      contextBudget,
    );
    const hasPrivateSolveContext = contextChunks.some((item) =>
      this.isPrivatePath(item.hit.vaultPath),
    );
    const citations = answerCitationsFromContext(contextChunks);
    const contextTokenCount = contextChunks.reduce((sum, item) => sum + item.tokenCount, 0);
    const contextTruncated =
      contextChunks.some((item) => item.truncated) ||
      hasMoreAnswerContext(isolatedHits, contextChunks);
    if (contextChunks.length === 0) {
      const solution = fallbackProblemSolution(req.question, "missing");
      return {
        question: req.question,
        solution,
        citations,
        citationCheck: checkProblemSolutionCitations(solution, citations),
        contextTokenCount,
        contextTruncated,
        search: scopedSearch,
        blockedReason: null,
      };
    }

    const context = contextChunks
      .map((item, idx) => formatAnswerContextItem(idx + 1, item))
      .join("\n\n");
    try {
      const output = await this.runRole(
        "solve",
        { question: req.question, context },
        req.signal,
        contextChunks[0]?.hit.vaultPath,
      );
      const solution =
        parseProblemSolution(output) ?? fallbackProblemSolution(req.question, "partial");
      return {
        question: req.question,
        solution,
        citations,
        citationCheck: checkProblemSolutionCitations(solution, citations),
        contextTokenCount,
        contextTruncated,
        search: scopedSearch,
        blockedReason: null,
      };
    } catch (e) {
      if (e instanceof AetherError && e.code === "BINDING_NOT_FOUND" && hasPrivateSolveContext) {
        const solution = fallbackProblemSolution(req.question, "missing");
        return {
          question: req.question,
          solution,
          citations,
          citationCheck: checkProblemSolutionCitations(solution, citations),
          contextTokenCount,
          contextTruncated,
          search: scopedSearch,
          blockedReason: "private-route-missing",
        };
      }
      throw e;
    }
  }

  async saveExperienceCard(draft: ExperienceCardDraft): Promise<Note> {
    const noteId = this.host.newId();
    const vaultPath = await buildUniqueExperienceVaultPath({
      rootFolder: this.experienceFolderForDraft(draft),
      noteId,
      title: draft.title,
      now: this.host.now(),
      host: this.host,
    });
    const fm = {
      aether_id: noteId,
      aether_kind: "note" as const,
      title: draft.title,
      tags: draft.tags,
      aether_summary: draft.summary || null,
      aether_experience: true,
      aether_problem: draft.problem,
      aether_solution_confidence: draft.confidence,
      aether_evidence_status: draft.evidenceStatus,
      aether_source: "manual" as const,
      aether_url: null,
      aether_created: this.host.now(),
      aether_updated: this.host.now(),
    };
    const body = renderExperienceCardBody(draft);
    const md = serializeDocument(fm, body);
    const parent = vaultPath.split("/").slice(0, -1).join("/");
    if (parent) await this.host.ensureDir(parent);
    await this.host.writeFile(vaultPath, md);
    const contentHash = await sha256Hex(md);
    const note: Note = {
      id: noteId,
      vaultPath,
      kind: "note",
      title: draft.title,
      summary: draft.summary || null,
      tags: draft.tags,
      url: null,
      source: "manual",
      sourceMeta: {
        experience: true,
        problem: draft.problem,
        confidence: draft.confidence,
        evidenceStatus: draft.evidenceStatus,
      },
      createdAt: this.host.now(),
      updatedAt: this.host.now(),
      contentHash,
      indexState: "indexing",
    };
    this.store.upsertNote(note);
    try {
      await this.reindexNote(note, body);
    } catch (e) {
      await this.store.removeNote(note.id);
      await this.host.deleteFile(vaultPath);
      throw e;
    }
    await this.saveIndex();
    return note;
  }

  // ---- AI helpers ----
  async rewrite(selection: string, style?: "concise" | "polished" | "neutral"): Promise<string> {
    const styleMap: Record<string, string> = {
      concise: "更精炼",
      polished: "更顺畅、专业",
      neutral: "更通顺自然",
    };
    const output = await this.runRole("rewrite", {
      selection,
      style: style ? styleMap[style] : "更通顺自然",
    });
    return String(output ?? "");
  }
  async summarize(selection: string): Promise<string> {
    const output = await this.runRole("summarize", { selection, maxSentences: 3 });
    return String(output ?? "");
  }
  async extract(selection: string): Promise<string[]> {
    const output = await this.runRole("extract", { selection, maxPoints: 5 });
    if (Array.isArray(output)) return output.filter((v): v is string => typeof v === "string");
    return String(output ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim())
      .filter((l) => l.length > 0);
  }

  /**
   * 通用角色调用入口：用任意 Role（包括用户自定义）跑一次。
   * UI 层（编辑器右键、角色编辑器测试按钮）应优先调这个，而不是上面的内置 wrapper。
   */
  async runRole(
    roleId: string,
    vars: Record<string, string | number>,
    signal?: AbortSignal,
    sourcePath?: string,
  ): Promise<unknown> {
    const roleBinding = this.resolveRoleBinding(roleId);
    const opts: Parameters<typeof runRole>[0] = {
      registry: this.registry,
      roles: this.roles,
      roleId,
      vars,
    };
    if (signal) opts.signal = signal;
    if (sourcePath && this.isPrivatePath(sourcePath)) {
      const routeFeature =
        roleBinding?.outputKind === "embedding"
          ? "embedding"
          : roleId === "solve"
            ? "solve"
            : "chat";
      const route = this.resolvePrivateRoute(routeFeature, roleBinding ?? undefined);
      if (!route) {
        throw new AetherError(
          "BINDING_NOT_FOUND",
          "Private content requires a trusted provider. Configure private role bindings or use a trusted provider fallback.",
        );
      }
      opts.providerOverride = route;
    }
    const r = await runRole(opts);
    if (r.usage) {
      await this.recordUsage({
        providerId: r.role.providerId,
        feature: featureForRole(r.role),
        model: r.role.modelName,
        usage: r.usage,
      });
    }
    return r.output;
  }

  /** 列出可在编辑器右键菜单中展示的 Roles。 */
  listEditorRoles(): AiRole[] {
    return this.roles.listForEditor();
  }

  async listRecentImportedMarkdown(): Promise<VaultFileMeta[]> {
    return this.host.listMarkdown(this.settings.current.ui.aetherInboxFolder);
  }

  canOpenImportFolder(): boolean {
    return this.host.canOpenFolder?.() ?? true;
  }

  openImportFolder(): Promise<void> {
    return this.host.openFolder(this.settings.current.ui.aetherInboxFolder);
  }

  private experienceFolderForDraft(draft: ExperienceCardDraft): string {
    const publicFolder = this.settings.current.ui.experienceFolder.replace(/\/+$/, "");
    const privateFolder = this.settings.current.ui.privateExperienceFolder.replace(/\/+$/, "");
    if (draft.privacyScope === "private") return privateFolder;
    if (draft.privacyScope === "public") return publicFolder;
    if (draft.citations.length === 0) return privateFolder;
    return draft.citations.some((citation) => this.isPrivatePath(citation.vaultPath))
      ? privateFolder
      : publicFolder;
  }

  now(): number {
    return this.host.now();
  }

  // ---- Indexing ----
  async checkIndexHealth(options: IndexRefreshOptions = {}): Promise<IndexHealth> {
    const folder = this.indexScanFolder();
    throwIfAborted(options.signal);
    const files = await this.host.listMarkdown(folder);
    const fileByPath = new Map(files.map((file) => [file.path, file]));
    const freshNotes: IndexHealthNote[] = [];
    const staleNotes: IndexHealthNote[] = [];
    const missingFiles: IndexHealthNote[] = [];
    const failures: IndexRefreshFailure[] = [];

    for (const note of this.store.allNotes()) {
      throwIfAborted(options.signal);
      if (!this.isPathInCurrentScanScope(note.vaultPath)) continue;
      const file = fileByPath.get(note.vaultPath);
      if (!file) {
        missingFiles.push(toIndexHealthNote(note, null, null));
        continue;
      }
      let raw: string;
      try {
        raw = await this.host.readFile(note.vaultPath);
      } catch (e) {
        if (isMissingFileError(e)) {
          missingFiles.push(toIndexHealthNote(note, null, null));
          continue;
        }
        failures.push({
          path: note.vaultPath,
          noteId: note.id,
          message: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
      const currentHash = await sha256Hex(raw);
      const item = toIndexHealthNote(note, currentHash, file);
      if (currentHash === note.contentHash) {
        freshNotes.push(item);
      } else {
        staleNotes.push(item);
      }
    }

    this.recalculateStaleCount([...staleNotes, ...missingFiles]);
    return {
      scannedFiles: files.length,
      indexedNotes: freshNotes.length + staleNotes.length + missingFiles.length,
      indexedChunks: this.store.allChunks().length,
      freshNotes,
      staleNotes,
      missingFiles,
      deletedNotes: missingFiles,
      failures,
    };
  }

  async refreshChangedIndex(options: IndexRefreshOptions = {}): Promise<IndexRefreshResult> {
    return this.runExclusiveIndexMutation(() => this.refreshChangedIndexOnce(options));
  }

  private async refreshChangedIndexOnce(
    options: IndexRefreshOptions = {},
  ): Promise<IndexRefreshResult> {
    const health = await this.checkIndexHealth(options);
    const reindexedNotes: IndexHealthNote[] = [];
    const failures = [...health.failures];
    for (const note of health.staleNotes) {
      throwIfAborted(options.signal);
      try {
        if (await this.indexExistingVaultFile(note.vaultPath, { signal: options.signal })) {
          reindexedNotes.push(note);
        }
      } catch (e) {
        if (isAbortError(e)) throw e;
        failures.push({
          path: note.vaultPath,
          noteId: note.noteId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const deletedByNoteId = new Map<string, IndexHealthNote>();
    for (const note of [...health.missingFiles, ...health.deletedNotes]) {
      deletedByNoteId.set(note.noteId, note);
    }
    const deletedNotes = [...deletedByNoteId.values()];
    for (const note of deletedNotes) {
      throwIfAborted(options.signal);
      await this.store.removeNote(note.noteId);
    }

    this.staleCount = 0;
    await this.saveIndex();
    return {
      health,
      reindexedNotes,
      deletedNotes,
      failures,
      indexedNotes: this.store.allNotes().length,
      indexedChunks: this.store.allChunks().length,
      staleNotes: health.staleNotes.length,
      missingFiles: health.missingFiles.length,
      freshNotes: health.freshNotes.length,
    };
  }

  async indexExistingVaultFile(
    vaultPath: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Note | null> {
    throwIfAborted(options.signal);
    const raw = await this.host.readFile(vaultPath);
    throwIfAborted(options.signal);
    const parsed = parseDocument(raw);
    const fmId =
      typeof parsed.frontmatter.aether_id === "string" ? parsed.frontmatter.aether_id : null;
    const id = fmId ?? `path:${vaultPath}`;
    const previousNotesAtPath = this.store
      .allNotes()
      .filter((note) => note.vaultPath === vaultPath);
    const previousChunksByNote = new Map(
      previousNotesAtPath.map((note) => [note.id, this.store.chunksForNote(note.id)]),
    );
    await this.removeExistingNotesAtPath(vaultPath, id);
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
    try {
      await this.reindexNote(note, parsed.body, { signal: options.signal });
    } catch (e) {
      await this.store.removeNote(note.id);
      for (const previous of previousNotesAtPath) {
        this.store.upsertNote(previous);
        await this.store.setChunks(previous.id, previousChunksByNote.get(previous.id) ?? []);
      }
      throw e;
    }
    return note;
  }

  async rebuildAll(options: RebuildOptions = {}): Promise<RebuildResult> {
    return this.runExclusiveIndexMutation(() => this.rebuildAllOnce(options));
  }

  private async rebuildAllOnce(options: RebuildOptions = {}): Promise<RebuildResult> {
    const folder = this.indexScanFolder();

    // —— 重要：先用一次小 probe 确认 embedding 维度，再清空 store。
    // 否则切换 embedding 模型（如 dim 8 → 2560）后再重建，老 chunks 残留导致
    // 后续搜索抛 EMBED_DIM_MISMATCH。
    try {
      throwIfAborted(options.signal);
      const role = this.roles.resolve("embedding");
      const provider = this.registry.getProvider(role.providerId);
      const probe = await provider.embed({
        inputs: ["dim probe"],
        model: role.modelName,
        signal: options.signal,
      });
      if (probe.usage) {
        await this.recordUsage({
          providerId: provider.id,
          feature: "embedding",
          model: role.modelName,
          usage: probe.usage,
        });
      }
      if (probe.dim !== this.embeddingDim) {
        this.embeddingDim = probe.dim;
        await this.store.setEmbeddingDim(probe.dim); // 这会清空 chunks 重建 schema
      } else {
        // 维度未变，但仍然把 chunks 清掉，确保 rebuild 是真的「全量重建」
        await this.store.clearChunks();
      }
      this.embeddingModel = probe.model;
    } catch (e) {
      if (isAbortError(e)) {
        options.onProgress?.({ phase: "saving", total: 0, scanned: 0, indexed: 0, failed: 0 });
        return { scanned: 0, indexed: 0, failed: 0, cancelled: true, failures: [] };
      }
      // 没绑 embedding 也照样允许 rebuild —— 走 BM25-only 模式。
      // 但若旧索引维度 > 0，把它降回 8 以避免后续混乱。
      await this.store.clearChunks();
    }

    if (options.signal?.aborted) {
      options.onProgress?.({ phase: "saving", total: 0, scanned: 0, indexed: 0, failed: 0 });
      await this.saveIndex();
      return { scanned: 0, indexed: 0, failed: 0, cancelled: true, failures: [] };
    }
    options.onProgress?.({ phase: "scanning", total: 0, scanned: 0, indexed: 0, failed: 0 });
    const files = await this.host.listMarkdown(folder);
    const filePaths = new Set(files.map((file) => file.path));
    for (const note of this.store.allNotes()) {
      if (!this.isPathInCurrentScanScope(note.vaultPath) || !filePaths.has(note.vaultPath)) {
        await this.store.removeNote(note.id);
      }
    }
    this.staleCount = 0;
    let indexed = 0;
    let scanned = 0;
    const failures: RebuildResult["failures"] = [];
    for (const [i, f] of files.entries()) {
      if (options.signal?.aborted) {
        options.onProgress?.({
          phase: "saving",
          total: files.length,
          scanned,
          indexed,
          failed: failures.length,
        });
        await this.saveIndex();
        return {
          scanned,
          indexed,
          failed: failures.length,
          cancelled: true,
          failures,
        };
      }
      options.onProgress?.({
        phase: "indexing",
        total: files.length,
        scanned: i + 1,
        indexed,
        failed: failures.length,
        currentPath: f.path,
      });
      try {
        if (await this.indexExistingVaultFile(f.path, { signal: options.signal })) indexed += 1;
      } catch (e) {
        if (isAbortError(e)) {
          options.onProgress?.({
            phase: "saving",
            total: files.length,
            scanned,
            indexed,
            failed: failures.length,
          });
          await this.saveIndex();
          return {
            scanned,
            indexed,
            failed: failures.length,
            cancelled: true,
            failures,
          };
        }
        failures.push({
          path: f.path,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      scanned = i + 1;
    }
    options.onProgress?.({
      phase: "saving",
      total: files.length,
      scanned: files.length,
      indexed,
      failed: failures.length,
    });
    await this.saveIndex();
    return {
      scanned: files.length,
      indexed,
      failed: failures.length,
      cancelled: false,
      failures,
    };
  }

  private async reindexNote(
    note: Note,
    body: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    throwIfAborted(options.signal);
    const chunks = chunkMarkdown(body);
    const isPrivate = this.isPrivatePath(note.vaultPath);
    const privateRoute = isPrivate ? this.resolvePrivateRoute("embedding") : null;
    let resolvedEmbeddings: number[][] = chunks.map(() =>
      new Array<number>(this.embeddingDim).fill(0),
    );
    let chunkEmbeddingModel: string | null = null;
    try {
      if (chunks.length > 0) {
        if (isPrivate && !privateRoute) {
          throw new AetherError(
            "BINDING_NOT_FOUND",
            "Private content has no embedding route; indexing with BM25 text only.",
          );
        }
        const role = this.roles.resolve("embedding");
        const providerId = privateRoute?.providerId ?? role.providerId;
        const model = privateRoute?.modelName ?? role.modelName;
        const provider = this.registry.getProvider(providerId);
        throwIfAborted(options.signal);
        const inputs = chunks.map((c) => c.content);
        const embed = await provider.embed({ inputs, model, signal: options.signal });
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
        chunkEmbeddingModel = model;
        resolvedEmbeddings = embed.vectors;
        if (embed.usage) {
          await this.recordUsage({
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
      embeddingModel: chunkEmbeddingModel,
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

  private async loadUsage(): Promise<void> {
    const raw = await this.host.readData(USAGE_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as UsageEntry[];
      this.usage.fromJSON(payload);
    } catch {
      this.host.notify("Usage data corrupt; token usage has been reset", {
        level: "warn",
        timeoutMs: 0,
      });
    }
  }

  private async saveUsage(): Promise<void> {
    await this.host.writeData(USAGE_KEY, JSON.stringify(this.usage.toJSON()));
  }

  private async recordUsage(args: {
    providerId: string;
    feature: Feature;
    model: string;
    usage: TokenUsage;
  }): Promise<void> {
    const monthlyWarn = this.settings.current.budgets.monthlyTokenWarn;
    const wasOverBudget = this.usage.isOverBudget(monthlyWarn);
    this.usage.record(args);
    await this.saveUsage();
    if (monthlyWarn !== null && !wasOverBudget && this.usage.isOverBudget(monthlyWarn)) {
      const total = tokenTotal(this.usage.snapshot().monthTotal);
      this.host.notify(
        `Monthly token budget warning reached: ${total}/${monthlyWarn} tokens used.`,
        { level: "warn", timeoutMs: 0 },
      );
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

  private indexScanFolder(): string {
    return this.settings.current.ui.scanScope === "vault"
      ? ""
      : this.settings.current.ui.aetherInboxFolder;
  }

  private withCurrentScanScope(req: SearchRequest): SearchRequest {
    if (this.settings.current.ui.scanScope === "vault") return req;
    const scopePrefix = this.currentScanPathPrefix();
    const requestedPrefix = req.filters?.pathPrefix?.replace(/\/+$/, "");
    const pathPrefix =
      requestedPrefix && requestedPrefix.length > 0
        ? intersectPathPrefixes(scopePrefix, requestedPrefix)
        : scopePrefix;
    return {
      ...req,
      filters: {
        ...req.filters,
        pathPrefix,
      },
    };
  }

  private filterSearchResponseToCurrentScanScope(response: SearchResponse): SearchResponse {
    if (this.settings.current.ui.scanScope === "vault") return response;
    return {
      ...response,
      hits: response.hits.filter((hit) => this.isPathInCurrentScanScope(hit.vaultPath)),
    };
  }

  private isPathInCurrentScanScope(vaultPath: string): boolean {
    if (this.settings.current.ui.scanScope === "vault") return true;
    const folder = this.currentScanPathPrefix();
    return vaultPath === folder || vaultPath.startsWith(`${folder}/`);
  }

  private currentScanPathPrefix(): string {
    return this.settings.current.ui.aetherInboxFolder.replace(/\/+$/, "");
  }

  private resolvePrivacyScope(scope: PrivacyScope | undefined): PrivacyScope {
    return scope === "public" || scope === "private" || scope === "all" ? scope : "all";
  }

  private filterSearchResponseByPrivacyScope(
    response: SearchResponse,
    scope: PrivacyScope,
  ): SearchResponse {
    return { ...response, hits: this.filterSearchHitsByPrivacyScope(response.hits, scope) };
  }

  private filterSearchHitsByPrivacyScope(hits: SearchHit[], scope: PrivacyScope): SearchHit[] {
    if (scope === "all") return hits;
    return hits.filter((hit) => this.isPrivatePath(hit.vaultPath) === (scope === "private"));
  }

  private isolateAnswerHitsByDomain(hits: SearchHit[], scope: PrivacyScope): SearchHit[] {
    if (scope !== "all" || hits.length <= 1) return hits;
    const firstIsPrivate = this.isPrivatePath(hits[0]!.vaultPath);
    return hits.filter((hit) => this.isPrivatePath(hit.vaultPath) === firstIsPrivate);
  }

  private searchOptionsForScope(scope: PrivacyScope): SearchRunOptions {
    if (scope !== "private") return {};
    const route = this.resolvePrivateRoute("embedding");
    if (route) return { embeddingOverride: route };
    return {
      forceText: true,
      textFallbackReason: "provider-error",
    };
  }

  private isPrivatePath(vaultPath: string): boolean {
    const normalizedPath = vaultPath.replace(/\/+$/, "");
    for (const folder of this.privatePathPrefixes()) {
      if (this.isPathUnderFolder(normalizedPath, folder)) return true;
    }
    return false;
  }

  private privatePathPrefixes(): string[] {
    const folders = [
      ...this.settings.current.privacy.privateFolders,
      this.settings.current.privacy.privateInboxFolder,
      this.settings.current.ui.privateExperienceFolder,
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const folder of folders) {
      const normalized = folder.trim().replace(/\/+$/, "");
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  private isPathUnderFolder(vaultPath: string, folder: string): boolean {
    return vaultPath === folder || vaultPath.startsWith(`${folder}/`);
  }

  private resolvePrivateRoute(
    feature: RouteFeature,
    roleBinding?: RoleBindingRoute,
  ): ProviderModelRoute | null {
    const fallback = roleBinding ?? this.roleBindingForFeature(feature);
    if (!fallback) return null;
    const privateRoute = this.privateRouteFromRoleBinding(fallback);
    if (privateRoute && this.isProviderTrustedForPrivate(privateRoute.providerId)) {
      return privateRoute;
    }
    if (
      fallback.providerId &&
      fallback.modelName &&
      this.isProviderTrustedForPrivate(fallback.providerId)
    ) {
      return { providerId: fallback.providerId, modelName: fallback.modelName };
    }
    return null;
  }

  private privateRouteFromRoleBinding(binding: RoleBindingRoute): ProviderModelRoute | null {
    const providerId = binding.privateProviderId?.trim() ?? "";
    const modelName = binding.privateModelName?.trim() ?? "";
    if (!providerId || !modelName) return null;
    return { providerId, modelName };
  }

  private roleBindingForFeature(feature: RouteFeature): RoleBindingRoute | null {
    const roleId =
      feature === "embedding"
        ? "embedding"
        : feature === "inbox_metadata"
          ? "inbox_metadata"
          : feature === "solve"
            ? "solve"
            : "answer";
    return this.resolveRoleBinding(roleId);
  }

  private resolveRoleBinding(roleId: string): RoleBindingRoute | null {
    try {
      const role = this.roles.resolve(roleId);
      return {
        providerId: role.providerId,
        modelName: role.modelName,
        outputKind: role.outputKind,
        privateProviderId: role.privateProviderId,
        privateModelName: role.privateModelName,
      };
    } catch {
      return null;
    }
  }

  private isProviderTrustedForPrivate(providerId: string): boolean {
    const provider = this.settings.current.providers.find((item) => item.id === providerId);
    return provider?.trustedForPrivate === true;
  }

  private async rememberImportTarget(target: "public" | "private"): Promise<void> {
    if (this.settings.current.privacy.importLastTarget === target) return;
    const next = structuredClone(this.settings.current);
    next.privacy.importLastTarget = target;
    await this.settings.save(next);
  }

  private recalculateStaleCount(notes: IndexHealthNote[]): void {
    const staleNoteIds = new Set(notes.map((note) => note.noteId));
    this.staleCount = this.store
      .allChunks()
      .filter((chunk) => staleNoteIds.has(chunk.noteId)).length;
  }

  private async runExclusiveIndexMutation<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.indexMutationTail;
    let release!: () => void;
    this.indexMutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async removeExistingNotesAtPath(vaultPath: string, keepNoteId: string): Promise<void> {
    for (const note of this.store.allNotes()) {
      if (note.vaultPath === vaultPath && note.id !== keepNoteId) {
        await this.store.removeNote(note.id);
      }
    }
  }
}

function featureForRole(role: AiRole): Feature {
  if (
    role.id === "summarize" ||
    role.id === "rewrite" ||
    role.id === "extract" ||
    role.id === "critique" ||
    role.id === "solve" ||
    role.id === "answer" ||
    role.id === "inbox_metadata"
  ) {
    return role.id;
  }
  return role.outputKind === "embedding" ? "embedding" : "chat";
}

function answerCitationsFromContext(contextChunks: AnswerContextItem[]): SearchAnswerCitation[] {
  return contextChunks.map((item, idx) => ({
    index: idx + 1,
    noteId: item.hit.noteId,
    vaultPath: item.hit.vaultPath,
    title: item.hit.title,
    chunkId: item.chunk.chunkId,
    headingPath: item.chunk.headingPath,
    excerpt: item.chunk.excerpt,
    url: item.hit.url,
    tokenCount: item.tokenCount,
    truncated: item.truncated,
  }));
}

function parseProblemSolution(raw: unknown): ProblemSolution | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const summary = asTrimmedString(obj.summary).slice(0, 240);
  if (!summary) return null;
  return {
    summary,
    confidence: normalizeProblemConfidence(obj.confidence),
    evidenceStatus: normalizeProblemEvidenceStatus(obj.evidenceStatus),
    likelyCauses: stringList(obj.likelyCauses, 5),
    steps: stringList(obj.steps, 7),
    risks: stringList(obj.risks, 5),
    missingInfo: stringList(obj.missingInfo, 5),
  };
}

function normalizeProblemConfidence(value: unknown): ProblemConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeProblemEvidenceStatus(value: unknown): ProblemEvidenceStatus {
  return value === "supported" || value === "partial" || value === "missing" ? value : "missing";
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackProblemSolution(
  question: string,
  evidenceStatus: ProblemEvidenceStatus,
): ProblemSolution {
  return {
    summary:
      evidenceStatus === "missing"
        ? "历史资料不足，以下是低信心通用处理建议。"
        : "历史资料只提供了部分线索，以下建议需要结合现场信息核对。",
    confidence: "low",
    evidenceStatus,
    likelyCauses: [],
    steps: [
      `明确问题边界：${question}`,
      "列出已经尝试过的方法和当前失败现象。",
      "优先从最小可验证动作开始，逐步排除原因。",
    ],
    risks: ["缺少足够历史证据，建议执行前先核对来源和现场约束。"],
    missingInfo: ["缺少可直接支撑解决方案的历史经验片段。"],
  };
}

function checkProblemSolutionCitations(
  solution: ProblemSolution,
  citations: SearchAnswerCitation[],
): SearchAnswerCitationCheck {
  return checkAnswerCitations(
    [
      solution.summary,
      ...solution.likelyCauses,
      ...solution.steps,
      ...solution.risks,
      ...solution.missingInfo,
    ].join("\n"),
    citations,
  );
}

async function buildUniqueExperienceVaultPath(args: {
  rootFolder: string;
  noteId: string;
  title: string;
  now: number;
  host: Pick<IHostAdapter, "exists">;
}): Promise<string> {
  const root = args.rootFolder.replace(/\/+$/, "") || "Aether Experience";
  const d = new Date(args.now);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const slug = slugify(args.title).slice(0, 40) || "experience";
  const dir = `${root}/${year}/${month}`;
  let n = 1;
  while (true) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = `${dir}/${args.noteId.slice(0, 10)}-${slug}${suffix}.md`;
    if (!(await args.host.exists(candidate))) return candidate;
    n += 1;
  }
}

function renderExperienceCardBody(draft: ExperienceCardDraft): string {
  const steps = draft.steps.length
    ? draft.steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n")
    : "1. 待补充";
  const sources = draft.citations.length
    ? draft.citations
        .map((citation) => `- [${citation.index}] ${citation.title} — ${citation.vaultPath}`)
        .join("\n")
    : "- 无历史来源";
  return `# ${draft.title}

## 问题
${draft.problem}

## 直接结论
${draft.summary}

## 推荐步骤
${steps}

## 来源
${sources}
`;
}

function toIndexHealthNote(
  note: Note,
  currentHash: string | null,
  file: VaultFileMeta | null,
): IndexHealthNote {
  return {
    noteId: note.id,
    vaultPath: note.vaultPath,
    title: note.title,
    contentHash: note.contentHash,
    currentHash,
    indexState: note.indexState,
    mtime: file?.mtime ?? null,
    size: file?.size ?? null,
  };
}

function tokenTotal(value: { promptTokens: number; completionTokens: number }): number {
  return value.promptTokens + value.completionTokens;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AetherError("ABORTED", "Aborted");
}

function isAbortError(e: unknown): boolean {
  if (e instanceof AetherError && e.code === "ABORTED") return true;
  return e instanceof Error && e.name === "AbortError";
}

function isMissingFileError(e: unknown): boolean {
  return e instanceof Error && /\bENOENT\b/.test(e.message);
}

function checkAnswerCitations(
  answer: string,
  citations: SearchAnswerCitation[],
): SearchAnswerCitationCheck {
  const available = new Set(citations.map((c) => c.index));
  const referenced = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const index = Number(match[1]);
    if (Number.isInteger(index) && index > 0) referenced.add(index);
  }
  const referencedIndexes = [...referenced].sort((a, b) => a - b);
  const invalidIndexes = referencedIndexes.filter((index) => !available.has(index));
  const unusedIndexes = [...available]
    .filter((index) => !referenced.has(index))
    .sort((a, b) => a - b);
  return {
    referencedIndexes,
    invalidIndexes,
    unusedIndexes,
    hasAnyReference: referencedIndexes.length > 0,
  };
}

function intersectPathPrefixes(a: string, b: string): string {
  if (a === b) return a;
  if (b.startsWith(`${a}/`)) return b;
  if (a.startsWith(`${b}/`)) return a;
  return "\0";
}

function selectAnswerContext(
  hits: SearchHit[],
  maxContextChunks: number,
  maxContextTokens: number,
): AnswerContextItem[] {
  const selected: AnswerContextItem[] = [];
  let remaining = maxContextTokens;
  for (const hit of hits) {
    for (const chunk of hit.topChunks) {
      if (remaining <= 0) return selected;
      const prepared = prepareAnswerChunk(chunk, remaining);
      if (!prepared) continue;
      selected.push({ hit, chunk, ...prepared });
      remaining -= prepared.tokenCount;
      if (selected.length >= maxContextChunks) return selected;
    }
  }
  return selected;
}

function hasMoreAnswerContext(hits: SearchHit[], selected: AnswerContextItem[]): boolean {
  const selectedIds = new Set(selected.map((item) => item.chunk.chunkId));
  return hits.some((hit) => hit.topChunks.some((chunk) => !selectedIds.has(chunk.chunkId)));
}

interface AnswerContextItem {
  hit: SearchHit;
  chunk: SearchHit["topChunks"][number];
  content: string;
  tokenCount: number;
  truncated: boolean;
}

function prepareAnswerChunk(
  chunk: SearchHit["topChunks"][number],
  maxTokens: number,
): Pick<AnswerContextItem, "content" | "tokenCount" | "truncated"> | null {
  const raw = (chunk.content ?? chunk.excerpt).trim();
  if (!raw) return null;
  const tokenCount = Math.max(1, chunk.tokenCount);
  if (tokenCount <= maxTokens) {
    return { content: raw, tokenCount, truncated: false };
  }
  const content = truncateByApproxTokens(raw, maxTokens);
  if (!content) return null;
  return { content, tokenCount: maxTokens, truncated: true };
}

function truncateByApproxTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(1, Math.floor(maxTokens * 2.5));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}…`;
}

function formatAnswerContextItem(index: number, item: AnswerContextItem): string {
  const heading = item.chunk.headingPath ? `\nHeading: ${item.chunk.headingPath}` : "";
  const url = item.hit.url ? `\nURL: ${item.hit.url}` : "";
  return `[${index}] ${item.hit.title}
Path: ${item.hit.vaultPath}${url}${heading}
${item.content}`;
}
