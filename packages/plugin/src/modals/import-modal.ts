import { App, Modal, Notice, Setting } from "obsidian";
import type AetherPlugin from "../main.js";
import type { ImportSource } from "@aether/core";
import { t } from "../i18n/index.js";

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
    this.contentEl.createEl("h2", { text: t("modal.import.title") });
    new Setting(this.contentEl).setName(t("modal.import.field")).addTextArea((ta) => {
      ta.inputEl.rows = 12;
      ta.inputEl.cols = 60;
      ta.onChange((v) => (this.text = v));
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("common.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modal.import.button"))
          .setCta()
          .onClick(async () => {
            if (!this.text.trim()) {
              new Notice(t("modal.import.empty"), 3000);
              return;
            }
            const source: ImportSource = {
              kind: "paste",
              label: `paste-${Date.now()}`,
              payload: { type: "paste-text", text: this.text },
            };
            this.close();
            let count = 0;
            let hasError = false;
            let errorMsg = "";
            try {
              for await (const e of this.plugin.core.importSource(source)) {
                if (e.type === "item-added") {
                  count += 1;
                } else if (e.type === "error") {
                  hasError = true;
                  errorMsg = e.message;
                  console.error("[Aether Import] Error:", e.message);
                }
              }
              if (hasError) {
                new Notice(t("modal.import.failed", { error: errorMsg }), 6000);
              } else if (count === 0) {
                new Notice(t("modal.import.zero"), 5000);
              } else {
                new Notice(t("modal.import.done", { count }), 4000);
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error("[Aether Import] Exception:", e);
              new Notice(t("modal.import.error", { error: msg }), 6000);
            }
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
