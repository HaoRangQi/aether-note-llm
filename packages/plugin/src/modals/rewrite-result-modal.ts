import { App, Modal, Notice, Setting } from "obsidian";
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
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: t("modal.aiResult.title") });

    el.createEl("h4", { text: t("modal.aiResult.original") });
    const origPre = el.createEl("pre", { text: this.original, cls: "aether-result-pre" });
    origPre.style.userSelect = "text";
    origPre.style.webkitUserSelect = "text";

    el.createEl("h4", { text: t("modal.aiResult.rewritten") });
    const rewritePre = el.createEl("pre", { text: this.rewritten, cls: "aether-result-pre" });
    rewritePre.style.userSelect = "text";
    rewritePre.style.webkitUserSelect = "text";

    new Setting(el)
      .addButton((b) =>
        b.setButtonText(t("common.discard")).onClick(() => this.close()),
      )
      .addButton((b) =>
        b.setButtonText(t("modal.aiResult.copy")).onClick(async () => {
          await navigator.clipboard.writeText(this.rewritten);
          new Notice(t("modal.aiResult.copied"), 2000);
        }),
      )
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
