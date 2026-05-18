import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";
import { ImportModal } from "../modals/import-modal.js";
import { escapeHtml, highlight } from "../ui/render.js";
import { t } from "../i18n/index.js";
import type { NoteKind, SearchHit, VaultFileMeta } from "@aether/core";

export const HUB_VIEW_TYPE = "aether-hub-view";

type Mode = "recent" | "search";
type Filter = "all" | "note" | "bookmark";

/**
 * Hub 主面板：取代 v0.1 的 search-view + inbox-view。
 *
 * 区块（自顶向下）：
 *   1. 状态条：索引数量 + 配置健康
 *   2. Onboarding 横幅（当无 Provider 配置时）
 *   3. 搜索框 + 过滤 chip
 *   4. 快速操作（导入）
 *   5. 主区：搜索结果 / 最近 7 天（互斥）
 */
export class HubView extends ItemView {
  private mode: Mode = "recent";
  private filter: Filter = "all";
  private query = "";
  private debounce?: number;

  // 缓存渲染 root 子区块，避免每次状态变化都重建整个 DOM
  private resultsEl?: HTMLElement;
  private statusEl?: HTMLElement;

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
    return "layers";
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

    // 2. Onboarding 横幅（条件渲染）
    this.renderOnboarding(root);

    // 3. 搜索框
    const input = root.createEl("input", {
      type: "text",
      placeholder: t("view.hub.searchPlaceholder"),
    });
    input.addClass("aether-search-input");
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

    // 5. 快速操作
    const actions = root.createDiv({ cls: "aether-hub-quickactions" });
    const importBtn = actions.createEl("button", { text: t("view.hub.import") });
    importBtn.onclick = () => new ImportModal(this.plugin.app, this.plugin).open();
    const folderBtn = actions.createEl("button", { text: t("view.hub.openFolder") });
    folderBtn.onclick = async () => {
      const folder = this.plugin.core.settings.current.ui.aetherInboxFolder;
      try {
        await this.plugin.core.host.openFolder(folder);
      } catch (e) {
        new Notice(
          t("settings.advanced.inboxFolder.openFailed", { error: (e as Error).message }),
          5000,
        );
      }
    };

    // 6. 结果区
    this.resultsEl = root.createDiv({ cls: "aether-hub-results" });
  }

  private renderStatus(el: HTMLElement): void {
    el.empty();
    const total = this.plugin.core.store.allChunks().length;
    const providers = this.plugin.core.settings.current.providers;
    const ok = providers.length > 0;
    const left = el.createSpan({ cls: "aether-status-pill" });
    const dot = left.createSpan({ cls: "aether-status-dot" });
    if (!ok) dot.addClass("warn");
    left.createSpan({ text: ok ? t("view.hub.statusReady") : t("view.hub.statusNoProvider") });
    el.createSpan({ text: t("view.hub.statusIndexed", { count: total }) });
  }

  private renderOnboarding(root: HTMLElement): void {
    const providers = this.plugin.core.settings.current.providers;
    if (providers.length > 0) return;
    const card = root.createDiv({ cls: "aether-onboard-card" });
    card.createDiv({ cls: "aether-onboard-title", text: t("view.hub.onboard.title") });
    card.createDiv({ cls: "aether-onboard-desc", text: t("view.hub.onboard.desc") });
    const btn = card.createEl("button", { text: t("view.hub.onboard.button") });
    btn.addClass("mod-cta");
    btn.onclick = () => {
      // 借 Obsidian 自带 API 打开本插件设置页
      const setting = (
        this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }
      ).setting;
      setting.open();
      setting.openTabById("aether-note-llm");
    };
  }

  // ---- 数据 -------------------------------------------------------------
  private async refreshResults(): Promise<void> {
    if (!this.resultsEl) return;
    if (this.mode === "search") {
      await this.renderSearch(this.resultsEl);
    } else {
      await this.renderRecent(this.resultsEl);
    }
  }

  private async renderRecent(root: HTMLElement): Promise<void> {
    root.empty();
    const folder = this.plugin.core.settings.current.ui.aetherInboxFolder;
    const title = root.createDiv({ cls: "aether-hub-section-title" });
    title.createSpan({ text: t("view.hub.recent.title") });
    let files: VaultFileMeta[] = [];
    try {
      files = await this.plugin.core.host.listMarkdown(folder);
    } catch {
      // 文件夹不存在等情况
    }
    files = files.sort((a, b) => b.mtime - a.mtime).slice(0, 10);
    if (files.length === 0) {
      root.createDiv({ cls: "aether-hub-empty", text: t("view.hub.recent.empty") });
      return;
    }
    for (const f of files) {
      const card = root.createDiv({ cls: "aether-recent-card" });
      const fileName = f.path.split("/").pop()?.replace(/\.md$/i, "") ?? f.path;
      const titleEl = card.createEl("div", { cls: "aether-card-title aether-clickable", text: fileName });
      titleEl.onClickEvent(() => {
        this.app.workspace.openLinkText(f.path, "", false);
      });
      const meta = card.createEl("div", { cls: "aether-card-meta" });
      meta.createSpan({ text: f.path });
      meta.createSpan({ text: relativeTime(f.mtime, this.plugin.core.host.now()) });
    }
  }

  private async renderSearch(root: HTMLElement): Promise<void> {
    root.empty();
    const q = this.query.trim();
    if (!q) return;
    const status = root.createDiv({ cls: "aether-hub-loading", text: t("view.hub.searching") });
    let hits: SearchHit[];
    try {
      const filterArg = this.filter === "all" ? undefined : (this.filter as NoteKind);
      const req: Parameters<typeof this.plugin.core.search>[0] = { query: q, limit: 20 };
      if (filterArg) req.filters = { kind: filterArg };
      hits = await this.plugin.core.search(req);
    } catch (e) {
      status.empty();
      root.createEl("p", { text: t("view.hub.searchFailed", { error: (e as Error).message }) });
      return;
    }
    status.remove();
    if (hits.length === 0) {
      root.createEl("p", { cls: "aether-hub-empty", text: t("view.hub.noMatches") });
      return;
    }
    for (const h of hits) {
      const card = root.createDiv({ cls: "aether-search-card" });
      const titleEl = card.createEl("div", { cls: "aether-card-title aether-clickable" });
      titleEl.innerHTML = highlight(h.title, q);
      titleEl.onClickEvent(() => {
        if (h.kind === "bookmark" && h.url) {
          window.open(h.url, "_blank");
        } else {
          this.app.workspace.openLinkText(h.vaultPath, "", false);
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
