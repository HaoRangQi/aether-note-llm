import { App, Modal, Setting } from "obsidian";

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
    this.contentEl.createEl("h2", { text: "AI result" });
    this.contentEl.createEl("h4", { text: "Original" });
    this.contentEl.createEl("pre", { text: this.original });
    this.contentEl.createEl("h4", { text: "Rewritten" });
    this.contentEl.createEl("pre", { text: this.rewritten });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Discard").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Replace selection")
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
