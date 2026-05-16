import { App, Modal, Setting } from "obsidian";

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
    this.contentEl.createEl("h2", { text: "Set API key" });
    new Setting(this.contentEl)
      .setName("API key")
      .setDesc("Stored locally in plugin data. Treat your vault as containing this secret.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.value).onChange((v) => (this.value = v));
      });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Save")
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
