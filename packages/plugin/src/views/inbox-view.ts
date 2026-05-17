import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";

export const INBOX_VIEW_TYPE = "aether-inbox-view";

export class InboxView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AetherPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return INBOX_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("view.inbox.name");
  }
  getIcon(): string {
    return "inbox";
  }

  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
  }

  private render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("aether-inbox-view");

    const items = this.plugin.core.inbox.listItems({ status: "pending" });
    if (items.length === 0) {
      root.createEl("p", { text: t("view.inbox.empty") });
      return;
    }
    root.createEl("p", { text: t("view.inbox.intro"), cls: "setting-item-description" });
    for (const item of items) {
      const card = root.createDiv({ cls: "aether-inbox-card" });
      card.createEl("div", { cls: "aether-card-title", text: item.proposedTitle });
      if (item.proposedSummary) {
        card.createEl("div", { cls: "aether-card-summary", text: item.proposedSummary });
      }
      const tags = card.createEl("div", { cls: "aether-card-tags" });
      for (const tg of item.proposedTags) {
        tags.createEl("span", { cls: "aether-tag", text: tg });
      }
      const preview = card.createEl("div", { cls: "aether-card-preview" });
      preview.setText(item.content.slice(0, 240));
      if (item.duplicateOf) {
        card.createEl("div", {
          cls: "aether-dup-warning",
          text: t("view.inbox.dupWarning"),
        });
      }
      const actions = card.createDiv({ cls: "aether-card-actions" });
      const approveBtn = actions.createEl("button", { text: t("view.inbox.approve") });
      approveBtn.onclick = async () => {
        try {
          await this.plugin.core.approveInboxItem(item.id);
          new Notice(t("view.inbox.approved"), 2000);
          this.render();
        } catch (e) {
          new Notice(t("view.inbox.approveFailed", { error: (e as Error).message }), 5000);
        }
      };
      const discardBtn = actions.createEl("button", { text: t("view.inbox.discard") });
      discardBtn.onclick = async () => {
        await this.plugin.core.discardInboxItem(item.id);
        this.render();
      };
    }
  }

  async onClose(): Promise<void> {}
}
