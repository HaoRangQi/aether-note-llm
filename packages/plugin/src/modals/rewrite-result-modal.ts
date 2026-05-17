import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n/index.js";

export class RewriteResultModal extends Modal {
  constructor(
    app: App,
    private readonly original: string,
    private readonly rewritten: string,
    private readonly onApply: (text: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("modal.aiResult.title") });
    this.contentEl.createEl("h4", { text: t("modal.aiResult.original") });
    this.contentEl.createEl("pre", { text: this.original });
    this.contentEl.createEl("h4", { text: t("modal.aiResult.rewritten") });
    this.contentEl.createEl("pre", { text: this.rewritten });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("common.discard")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modal.aiResult.replace"))
          .setCta()
          .onClick(() => {
            this.onApply(this.rewritten);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
