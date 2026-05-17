import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n/index.js";

export class ApiKeyModal extends Modal {
  private value = "";
  private onSubmit: (key: string) => void;

  constructor(app: App, initial: string, onSubmit: (key: string) => void) {
    super(app);
    this.value = initial;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("modal.apiKey.title") });
    new Setting(this.contentEl)
      .setName(t("modal.apiKey.field"))
      .setDesc(t("modal.apiKey.desc"))
      .addText((tb) => {
        tb.inputEl.type = "password";
        tb.setValue(this.value).onChange((v) => (this.value = v));
      });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("common.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("common.save"))
          .setCta()
          .onClick(() => {
            this.onSubmit(this.value.trim());
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
