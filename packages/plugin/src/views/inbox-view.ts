import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";

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
    return "Aether Inbox";
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
      root.createEl("p", { text: "Inbox is empty." });
      return;
    }
    for (const item of items) {
      const card = root.createDiv({ cls: "aether-inbox-card" });
      card.createEl("div", { cls: "aether-card-title", text: item.proposedTitle });
      if (item.proposedSummary) {
        card.createEl("div", { cls: "aether-card-summary", text: item.proposedSummary });
      }
      const tags = card.createEl("div", { cls: "aether-card-tags" });
      for (const t of item.proposedTags) {
        tags.createEl("span", { cls: "aether-tag", text: t });
      }
      const preview = card.createEl("div", { cls: "aether-card-preview" });
      preview.setText(item.content.slice(0, 240));
      if (item.duplicateOf) {
        card.createEl("div", {
          cls: "aether-dup-warning",
          text: "Possible duplicate of an existing note.",
        });
      }
      const actions = card.createDiv({ cls: "aether-card-actions" });
      const approveBtn = actions.createEl("button", { text: "Approve" });
      approveBtn.onclick = async () => {
        try {
          await this.plugin.core.approveInboxItem(item.id);
          new Notice("Approved", 2000);
          this.render();
        } catch (e) {
          new Notice(`Approve failed: ${(e as Error).message}`, 5000);
        }
      };
      const discardBtn = actions.createEl("button", { text: "Discard" });
      discardBtn.onclick = async () => {
        await this.plugin.core.discardInboxItem(item.id);
        this.render();
      };
    }
  }

  async onClose(): Promise<void> {}
}
