import { App, Modal, Notice, Setting } from "obsidian";
import type AetherPlugin from "../main.js";
import type { ImportSource } from "@aether/core";

export class ImportModal extends Modal {
  private text = "";
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Import to Aether Inbox" });
    new Setting(this.contentEl).setName("Paste markdown / text").addTextArea((ta) => {
      ta.inputEl.rows = 12;
      ta.inputEl.cols = 60;
      ta.onChange((v) => (this.text = v));
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Import")
          .setCta()
          .onClick(async () => {
            if (!this.text.trim()) return;
            const source: ImportSource = {
              kind: "paste",
              label: `paste-${Date.now()}`,
              payload: { type: "paste-text", text: this.text },
            };
            this.close();
            let count = 0;
            for await (const e of this.plugin.core.importSource(source)) {
              if (e.type === "item-added") count += 1;
            }
            new Notice(`Imported ${count} item(s) to Inbox`, 4000);
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
