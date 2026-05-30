import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";
import {
  getPendingImportItems,
  ImportModal,
  openPendingImportItems,
} from "../modals/import-modal.js";
import { JobHistoryModal } from "../modals/job-history-modal.js";
import { UsageModal } from "../modals/usage-modal.js";
import { escapeHtml, highlight } from "../ui/render.js";
import { formatAnswerWithSources } from "../ui/answer-sources.js";
import { copyToClipboard } from "../ui/clipboard.js";
import { t } from "../i18n/index.js";
import { getConfigHealth, type HealthIssue } from "../ui/config-health.js";
import { runRebuildJob, runRefreshIndexJob } from "../ui/job-tracker.js";
import {
  isAetherError,
  type NoteKind,
  type PrivacyScope,
  type SearchAnswerResponse,
  type SearchHit,
  type SearchMeta,
  type SearchResponse,
  type VaultFileMeta,
} from "@aether/core";

export const HUB_VIEW_TYPE = "aether-hub-view";
export const HUB_ICON = "bot-message-square";

type Mode = "recent" | "search";
type Filter = "all" | "note" | "bookmark";

/**
 * Hub 主面板：取代 v0.1 的 search-view + inbox-view。
 *
 * 区块（自顶向下）：
 *   1. 状态条：索引数量 + 配置健康
 *   2. 配置健康横幅（当 Provider / Role 未完整配置时）
 *   3. 搜索框 + 过滤 chip
 *   4. 快速操作（导入）
 *   5. 主区：搜索结果 / 最近 7 天（互斥）
 */
export class HubView extends ItemView {
  private mode: Mode = "recent";
  private filter: Filter = "all";
  private privacyScope: PrivacyScope = "public";
  private query = "";
  private debounce?: number;
  private resultsRequestId = 0;

  // 缓存渲染 root 子区块，避免每次状态变化都重建整个 DOM
  private resultsEl?: HTMLElement;
  private statusEl?: HTMLElement;
  private onboardingEl?: HTMLElement;
  private pendingImportsBtn?: HTMLButtonElement;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AetherPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return HUB_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("view.hub.name");
  }
  getIcon(): string {
    return HUB_ICON;
  }

  async onOpen(): Promise<void> {
    await this.renderShell();
    await this.refreshResults();
  }

  async onClose(): Promise<void> {}

  // ---- 外部触发 ---------------------------------------------------------
  /** 由 main.ts 在 settings 改动 / 导入完成后调用，刷新最近列表与状态条。 */
  async refresh(): Promise<void> {
    if (!this.statusEl) return;
    this.renderStatus(this.statusEl);
    if (this.onboardingEl) this.renderOnboarding(this.onboardingEl);
    this.renderPendingImportButtonState();
    await this.refreshResults();
  }

  // ---- 渲染 -------------------------------------------------------------
  private async renderShell(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("aether-hub-view");

    // 1. 状态条
    this.statusEl = root.createDiv({ cls: "aether-hub-statusbar" });
    this.renderStatus(this.statusEl);

    // 2. 配置健康横幅（条件渲染）
    this.onboardingEl = root.createDiv({ cls: "aether-hub-onboarding" });
    this.renderOnboarding(this.onboardingEl);

    // 3. 搜索框
    const input = root.createEl("input", {
      type: "text",
      placeholder: t("view.hub.searchPlaceholder"),
    });
    input.addClass("aether-search-input");
    root.createDiv({
      cls: "aether-search-privacy-hint",
      text: t("view.hub.searchPrivacyHint"),
    });
    input.addEventListener("input", () => {
      this.query = input.value;
      window.clearTimeout(this.debounce);
      this.debounce = window.setTimeout(() => {
        this.mode = this.query.trim() ? "search" : "recent";
        void this.refreshResults();
      }, 300) as unknown as number;
    });

    // 4. 过滤 chip
    const filterBar = root.createDiv({ cls: "aether-hub-filterbar" });
    const mkChip = (key: Filter, label: string): HTMLButtonElement => {
      const b = filterBar.createEl("button", { text: label });
      if (this.filter === key) b.addClass("active");
      b.onclick = () => {
        this.filter = key;
        // 重渲染所有 chip 的 active 状态
        filterBar.findAll("button").forEach((el) => el.removeClass("active"));
        b.addClass("active");
        void this.refreshResults();
      };
      return b;
    };
    mkChip("all", t("view.hub.filter.all"));
    mkChip("note", t("view.hub.filter.note"));
    mkChip("bookmark", t("view.hub.filter.bookmark"));

    const privacyBar = root.createDiv({ cls: "aether-hub-privacy-scope" });
    const mkScope = (scope: PrivacyScope, label: string): void => {
      const button = privacyBar.createEl("button", { text: label });
      if (this.privacyScope === scope) button.addClass("active");
      button.onclick = () => {
        this.privacyScope = scope;
        privacyBar.findAll("button").forEach((el) => el.removeClass("active"));
        button.addClass("active");
        if (this.query.trim()) this.mode = "search";
        void this.refreshResults();
      };
    };
    mkScope("public", t("view.hub.privacyScope.public"));
    mkScope("private", t("view.hub.privacyScope.private"));
    mkScope("all", t("view.hub.privacyScope.all"));

    // 5. 快速操作
    const actions = root.createDiv({ cls: "aether-hub-quickactions" });
    const importBtn = actions.createEl("button", { text: t("view.hub.import") });
    importBtn.onclick = () => new ImportModal(this.plugin.app, this.plugin).open();
    const pendingBtn = actions.createEl("button");
    this.pendingImportsBtn = pendingBtn;
    this.renderPendingImportButtonState();
    pendingBtn.onclick = () => {
      if (openPendingImportItems(this.plugin.app, this.plugin)) {
        this.renderPendingImportButtonState();
      }
    };
    const jobsBtn = actions.createEl("button", { text: t("view.hub.jobs") });
    jobsBtn.onclick = () => new JobHistoryModal(this.plugin.app, this.plugin).open();
    const usageBtn = actions.createEl("button", { text: t("view.hub.usage") });
    usageBtn.onclick = () => new UsageModal(this.plugin.app, this.plugin).open();
    const refreshBtn = actions.createEl("button", { text: t("view.hub.refreshIndex") });
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      await runRefreshIndexJob(this.plugin, {
        onDone: () => this.refresh(),
        onCancel: () => {
          refreshBtn.disabled = false;
        },
        onError: () => {
          refreshBtn.disabled = false;
        },
        onAlreadyRunning: () => {
          refreshBtn.disabled = false;
        },
      });
      refreshBtn.disabled = false;
    };
    if (this.plugin.core.canOpenImportFolder()) {
      const folderBtn = actions.createEl("button", { text: t("view.hub.openFolder") });
      folderBtn.onclick = async () => {
        try {
          await this.plugin.core.openImportFolder();
        } catch (e) {
          new Notice(
            t("settings.advanced.inboxFolder.openFailed", { error: (e as Error).message }),
            5000,
          );
        }
      };
    }

    // 6. 结果区
    this.resultsEl = root.createDiv({ cls: "aether-hub-results" });
  }

  private renderStatus(el: HTMLElement): void {
    el.empty();
    const total = this.plugin.core.store.allChunks().length;
    const health = getConfigHealth(this.plugin.core.settings.current);
    const left = el.createSpan({ cls: "aether-status-pill" });
    const dot = left.createSpan({ cls: "aether-status-dot" });
    if (health.status !== "ready") dot.addClass(health.status === "error" ? "error" : "warn");
    const labelKey =
      health.status === "ready"
        ? "view.hub.statusReady"
        : health.status === "error"
          ? "view.hub.statusNeedsSetup"
          : "view.hub.statusPartial";
    left.createSpan({ text: t(labelKey) });
    el.createSpan({ text: t("view.hub.statusIndexed", { count: total }) });
  }

  private renderPendingImportButtonState(): void {
    if (!this.pendingImportsBtn) return;
    const pendingCount = getPendingImportItems(this.plugin).length;
    this.pendingImportsBtn.setText(t("view.hub.pendingImports", { count: pendingCount }));
    this.pendingImportsBtn.disabled = pendingCount === 0;
  }

  private renderOnboarding(root: HTMLElement): void {
    root.empty();
    const health = getConfigHealth(this.plugin.core.settings.current);
    if (health.status === "ready") {
      root.style.display = "none";
      return;
    }
    root.style.display = "";
    const card = root.createDiv({ cls: "aether-onboard-card" });
    card.createDiv({ cls: "aether-onboard-title", text: t("view.hub.health.title") });
    card.createDiv({ cls: "aether-onboard-desc", text: t("view.hub.health.desc") });
    const list = card.createEl("ul", { cls: "aether-health-issues" });
    const visibleIssues = health.issues.slice(0, 5);
    for (const issue of visibleIssues) {
      list.createEl("li", {
        cls: `aether-health-issue aether-health-issue--${issue.severity}`,
        text: issueText(issue),
      });
    }
    const hiddenCount = health.issues.length - visibleIssues.length;
    if (hiddenCount > 0) {
      list.createEl("li", {
        cls: "aether-health-issue",
        text: t("view.hub.health.more", { count: hiddenCount }),
      });
    }
    const btn = card.createEl("button", { text: t("view.hub.health.button") });
    btn.addClass("mod-cta");
    btn.onclick = () => {
      this.openSettings();
    };
  }

  private openSettings(): void {
    // 借 Obsidian 自带 API 打开本插件设置页
    const setting = (
      this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }
    ).setting;
    setting.open();
    setting.openTabById("aether-note-llm");
  }

  // ---- 数据 -------------------------------------------------------------
  private async refreshResults(): Promise<void> {
    if (!this.resultsEl) return;
    const requestId = ++this.resultsRequestId;
    if (this.mode === "search") {
      await this.renderSearch(this.resultsEl, requestId);
    } else {
      await this.renderRecent(this.resultsEl, requestId);
    }
  }

  private async renderRecent(root: HTMLElement, requestId: number): Promise<void> {
    root.empty();
    const title = root.createDiv({ cls: "aether-hub-section-title" });
    title.createSpan({ text: t("view.hub.recent.title") });
    let files: VaultFileMeta[] = [];
    try {
      files = await this.plugin.core.listRecentImportedMarkdown();
    } catch {
      // 文件夹不存在等情况
    }
    if (!this.isCurrentResultsRequest(requestId)) return;
    files = files.sort((a, b) => b.mtime - a.mtime).slice(0, 10);
    if (files.length === 0) {
      root.createDiv({ cls: "aether-hub-empty", text: t("view.hub.recent.empty") });
      return;
    }
    for (const f of files) {
      const card = root.createDiv({ cls: "aether-recent-card" });
      const fileName = f.path.split("/").pop()?.replace(/\.md$/i, "") ?? f.path;
      const titleEl = card.createEl("div", {
        cls: "aether-card-title aether-clickable",
        text: fileName,
      });
      titleEl.onClickEvent(() => {
        void this.openVaultSource(f.path);
      });
      const meta = card.createEl("div", { cls: "aether-card-meta" });
      meta.createSpan({ text: f.path });
      meta.createSpan({ text: relativeTime(f.mtime, this.plugin.core.now()) });
    }
  }

  private async renderSearch(root: HTMLElement, requestId: number): Promise<void> {
    root.empty();
    const q = this.query.trim();
    if (!q) return;
    const status = root.createDiv({ cls: "aether-hub-loading", text: t("view.hub.searching") });
    let hits: SearchHit[];
    let meta: SearchMeta;
    try {
      const filterArg = this.filter === "all" ? undefined : (this.filter as NoteKind);
      const req: Parameters<typeof this.plugin.core.searchWithMeta>[0] = {
        query: q,
        limit: 20,
        privacyScope: this.privacyScope,
      };
      if (filterArg) req.filters = { kind: filterArg };
      const result = await this.plugin.core.searchWithMeta(req);
      if (!this.isCurrentResultsRequest(requestId)) return;
      hits = result.hits;
      meta = result.meta;
    } catch (e) {
      if (!this.isCurrentResultsRequest(requestId)) return;
      status.empty();
      // 维度不匹配是切换 embedding 模型后没重建索引的典型坑，给出可执行提示
      if (isAetherError(e) && e.code === "EMBED_DIM_MISMATCH") {
        const box = root.createDiv({ cls: "aether-onboard-card" });
        box.createDiv({
          cls: "aether-onboard-title",
          text: t("view.hub.dimMismatch.title"),
        });
        box.createDiv({
          cls: "aether-onboard-desc",
          text: t("view.hub.dimMismatch.desc"),
        });
        const btn = box.createEl("button", { text: t("view.hub.dimMismatch.button") });
        btn.addClass("mod-cta");
        btn.onclick = async () => {
          btn.disabled = true;
          btn.setText(t("view.hub.dimMismatch.running"));
          await runRebuildJob(this.plugin, {
            onDone: () => this.refreshResults(),
            onCancel: () => {
              btn.disabled = false;
              btn.setText(t("view.hub.dimMismatch.button"));
            },
            onError: () => {
              btn.disabled = false;
              btn.setText(t("view.hub.dimMismatch.button"));
            },
            onAlreadyRunning: () => {
              btn.disabled = false;
              btn.setText(t("view.hub.dimMismatch.button"));
            },
          });
        };
        return;
      }
      root.createEl("p", { text: t("view.hub.searchFailed", { error: (e as Error).message }) });
      return;
    }
    status.remove();
    this.renderSearchMeta(root, meta);
    if (hits.length === 0) {
      root.createEl("p", { cls: "aether-hub-empty", text: t("view.hub.noMatches") });
      return;
    }
    this.renderAnswerPanel(root, q, { hits, meta });
    for (const h of hits) {
      const card = root.createDiv({ cls: "aether-search-card" });
      const titleEl = card.createEl("div", { cls: "aether-card-title aether-clickable" });
      titleEl.innerHTML = highlight(h.title, q);
      titleEl.onClickEvent(() => {
        if (h.kind === "bookmark" && h.url) {
          void this.openExternal(h.url);
        } else {
          void this.openVaultSource(h.vaultPath);
        }
      });
      if (h.summary) {
        card.createEl("div", { cls: "aether-card-summary", text: h.summary });
      }
      for (const c of h.topChunks) {
        const ex = card.createEl("div", { cls: "aether-card-excerpt" });
        ex.innerHTML = highlight(c.excerpt, q);
      }
      const meta = card.createEl("div", { cls: "aether-card-meta" });
      meta.innerHTML = `<span>${escapeHtml(h.kind)}</span><span>${escapeHtml(h.vaultPath)}</span>`;
    }
  }

  private isCurrentResultsRequest(requestId: number): boolean {
    return requestId === this.resultsRequestId;
  }

  private renderSearchMeta(root: HTMLElement, meta: SearchMeta): void {
    const bar = root.createDiv({ cls: `aether-search-meta aether-search-meta--${meta.mode}` });
    const label = bar.createSpan({ cls: "aether-search-meta-label" });
    label.setText(t(`view.hub.searchMode.${meta.mode}`));
    const detailKey =
      meta.fallbackReason === null
        ? meta.mode === "stale-biased"
          ? "view.hub.searchMode.staleDetail"
          : "view.hub.searchMode.hybridDetail"
        : `view.hub.searchFallback.${meta.fallbackReason}`;
    bar.createSpan({
      cls: "aether-search-meta-detail",
      text: t(detailKey, {
        alpha: meta.alpha.toFixed(2),
        stale: Math.round(meta.staleRatio * 100),
      }),
    });
  }

  private renderAnswerPanel(root: HTMLElement, query: string, search: SearchResponse): void {
    const panel = root.createDiv({ cls: "aether-answer-panel" });
    const header = panel.createDiv({ cls: "aether-answer-header" });
    header.createDiv({ cls: "aether-answer-title", text: t("view.hub.answer.title") });
    const button = header.createEl("button", { text: t("view.hub.answer.button") });
    const body = panel.createDiv({ cls: "aether-answer-body" });
    body.createDiv({ cls: "aether-answer-hint", text: t("view.hub.answer.hint") });
    let controller: AbortController | null = null;

    button.onclick = async () => {
      if (controller) {
        controller.abort();
        return;
      }
      const ac = new AbortController();
      controller = ac;
      button.setText(t("view.hub.answer.cancel"));
      body.empty();
      body.createDiv({ cls: "aether-hub-loading", text: t("view.hub.answer.loading") });
      try {
        const filterArg = this.filter === "all" ? undefined : (this.filter as NoteKind);
        const req: Parameters<typeof this.plugin.core.answerSearch>[0] = {
          query,
          search,
          limit: 8,
          maxContextChunks: 6,
          privacyScope: this.privacyScope,
          signal: ac.signal,
        };
        if (filterArg) req.filters = { kind: filterArg };
        const answer = await this.plugin.core.answerSearch(req);
        if (ac.signal.aborted) {
          body.empty();
          body.createDiv({ cls: "aether-answer-error", text: t("ai.cancelled") });
          return;
        }
        this.renderAnswerBody(body, answer);
      } catch (e) {
        body.empty();
        if (ac.signal.aborted) {
          body.createDiv({ cls: "aether-answer-error", text: t("ai.cancelled") });
        } else if (isAetherError(e) && e.code === "BINDING_NOT_FOUND") {
          body.createDiv({ cls: "aether-answer-error", text: t("view.hub.answer.notConfigured") });
        } else {
          body.createDiv({
            cls: "aether-answer-error",
            text: t("view.hub.answer.failed", { error: (e as Error).message }),
          });
        }
      } finally {
        if (controller === ac) controller = null;
        button.setText(t("view.hub.answer.button"));
      }
    };
  }

  private renderAnswerBody(root: HTMLElement, answer: SearchAnswerResponse): void {
    root.empty();
    if (!answer.answer.trim()) {
      root.createDiv({ cls: "aether-answer-empty", text: t("view.hub.answer.empty") });
      return;
    }
    root.createEl("div", {
      cls: "aether-answer-text",
      text: answer.answer,
    });
    const toolbar = root.createDiv({ cls: "aether-answer-toolbar" });
    const copyBtn = toolbar.createEl("button", {
      cls: "aether-answer-copy",
      text: t("view.hub.answer.copyWithSources"),
    });
    copyBtn.onclick = async () => {
      await copyToClipboard(formatAnswerWithSources(answer), {
        successMessage: t("view.hub.answer.copied"),
        notify: (message, timeoutMs) => new Notice(message, timeoutMs),
      });
    };
    root.createDiv({
      cls: `aether-answer-context${answer.contextTruncated ? " is-truncated" : ""}`,
      text: answer.contextTruncated
        ? t("view.hub.answer.contextTruncated", { tokens: answer.contextTokenCount })
        : t("view.hub.answer.contextUsed", { tokens: answer.contextTokenCount }),
    });
    this.renderCitationCheck(root, answer);
    const refs = root.createDiv({ cls: "aether-answer-citations" });
    for (const citation of answer.citations) {
      const details = refs.createEl("details", { cls: "aether-answer-source" });
      details.createEl("summary", {
        cls: "aether-answer-source-summary",
        text: `[${citation.index}] ${citation.title}`,
      });
      const meta = details.createDiv({ cls: "aether-answer-source-meta" });
      this.renderSourceMeta(meta, t("view.hub.answer.sourcePath"), citation.vaultPath);
      this.renderSourceMeta(meta, t("view.hub.answer.sourceHeading"), citation.headingPath || "-");
      if (citation.url) {
        this.renderSourceMeta(meta, t("view.hub.answer.sourceUrl"), citation.url);
      }
      const excerpt = details.createDiv({ cls: "aether-answer-source-excerpt" });
      excerpt.createDiv({
        cls: "aether-answer-source-label",
        text: t("view.hub.answer.sourceExcerpt"),
      });
      excerpt.createDiv({ cls: "aether-answer-source-text", text: citation.excerpt });
      if (citation.truncated) {
        details.createDiv({
          cls: "aether-answer-source-note",
          text: t("view.hub.answer.sourceTruncated"),
        });
      }
      const openBtn = details.createEl("button", {
        cls: "aether-answer-source-open",
        text: t("view.hub.answer.openSource"),
      });
      openBtn.onclick = () => {
        if (citation.url) {
          void this.openExternal(citation.url);
        } else {
          void this.openVaultSource(citation.vaultPath);
        }
      };
    }
  }

  private renderSourceMeta(root: HTMLElement, label: string, value: string): void {
    const row = root.createDiv({ cls: "aether-answer-source-meta-row" });
    row.createSpan({ cls: "aether-answer-source-label", text: label });
    row.createSpan({ cls: "aether-answer-source-value", text: value });
  }

  private async openExternal(url: string): Promise<void> {
    try {
      await this.plugin.hostAdapter.openExternal(url);
    } catch (e) {
      new Notice(t("view.hub.openExternalFailed", { error: (e as Error).message }), 5000);
    }
  }

  private async openVaultSource(path: string): Promise<void> {
    try {
      await this.app.workspace.openLinkText(path, "", false);
    } catch (e) {
      new Notice(t("view.hub.openVaultSourceFailed", { error: (e as Error).message }), 5000);
    }
  }

  private renderCitationCheck(root: HTMLElement, answer: SearchAnswerResponse): void {
    const check = answer.citationCheck;
    if (check.invalidIndexes.length > 0) {
      root.createDiv({
        cls: "aether-answer-warning",
        text: t("view.hub.answer.invalidCitations", {
          indexes: check.invalidIndexes.map((index) => `[${index}]`).join(", "),
        }),
      });
      return;
    }
    if (!check.hasAnyReference && answer.citations.length > 0) {
      root.createDiv({
        cls: "aether-answer-warning",
        text: t("view.hub.answer.noCitations"),
      });
    }
  }
}

function relativeTime(then: number, now: number): string {
  const ms = Math.max(0, now - then);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("view.hub.time.justNow");
  if (min < 60) return t("view.hub.time.minutes", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("view.hub.time.hours", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("view.hub.time.days", { n: d });
  const mo = Math.floor(d / 30);
  return t("view.hub.time.months", { n: mo });
}

function issueText(issue: HealthIssue): string {
  return t(`view.hub.health.issue.${issue.code}`, { role: issue.roleName ?? "" });
}
