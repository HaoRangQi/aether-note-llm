import { ItemView, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";
import { escapeHtml, highlight } from "../ui/render.js";
import { t } from "../i18n/index.js";

export const SEARCH_VIEW_TYPE = "aether-search-view";

export class SearchView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AetherPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return SEARCH_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("view.search.name");
  }
  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("aether-search-view");

    const input = root.createEl("input", {
      type: "text",
      placeholder: t("view.search.placeholder"),
    });
    input.addClass("aether-search-input");

    const results = root.createDiv({ cls: "aether-search-results" });

    let timer: number | undefined;
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => this.runSearch(input.value, results),
        300,
      ) as unknown as number;
    });
  }

  private async runSearch(query: string, results: HTMLElement): Promise<void> {
    results.empty();
    if (!query.trim()) return;
    results.createEl("div", { text: t("view.search.searching"), cls: "aether-search-status" });
    try {
      const hits = await this.plugin.core.search({ query, limit: 20 });
      results.empty();
      if (hits.length === 0) {
        results.createEl("p", { text: t("view.search.noMatches") });
        return;
      }
      for (const h of hits) {
        const card = results.createDiv({ cls: "aether-search-card" });
        const titleEl = card.createEl("div", { cls: "aether-card-title" });
        titleEl.innerHTML = highlight(h.title, query);
        if (h.summary) {
          card.createEl("div", { cls: "aether-card-summary", text: h.summary });
        }
        for (const c of h.topChunks) {
          const ex = card.createEl("div", { cls: "aether-card-excerpt" });
          ex.innerHTML = highlight(c.excerpt, query);
        }
        const meta = card.createEl("div", { cls: "aether-card-meta" });
        meta.innerHTML = `<span>${escapeHtml(h.kind)}</span> · <span>${escapeHtml(h.vaultPath)}</span>`;
        card.onClickEvent(() => {
          if (h.kind === "bookmark" && h.url) {
            window.open(h.url, "_blank");
          } else {
            this.app.workspace.openLinkText(h.vaultPath, "", false);
          }
        });
      }
    } catch (e) {
      results.empty();
      results.createEl("p", { text: t("view.search.failed", { error: (e as Error).message }) });
    }
  }

  async onClose(): Promise<void> {
    // nothing
  }
}
