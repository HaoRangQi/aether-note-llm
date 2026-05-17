import { App, Modal, Notice, Setting } from "obsidian";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";

export class DiagnosticsModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("modal.diagnostics.title") });
    const settings = this.plugin.core.settings.current;
    const scrubbed = JSON.parse(JSON.stringify(settings)) as typeof settings;
    scrubbed.apiKeys = Object.fromEntries(
      Object.keys(scrubbed.apiKeys).map((k) => [k, "<redacted>"]),
    );
    const report = {
      pluginVersion: this.plugin.manifest.version,
      obsidianApi: this.plugin.manifest.minAppVersion,
      indexCount: this.plugin.core.store.allNotes().length,
      chunkCount: this.plugin.core.store.allChunks().length,
      pendingInbox: this.plugin.core.inbox.listItems({ status: "pending" }).length,
      settings: scrubbed,
      usage: this.plugin.core.usage.snapshot(),
    };
    const text = JSON.stringify(report, null, 2);
    const pre = this.contentEl.createEl("pre");
    pre.setText(text);
    new Setting(this.contentEl).addButton((b) =>
      b
        .setButtonText(t("modal.diagnostics.copy"))
        .setCta()
        .onClick(async () => {
          await navigator.clipboard.writeText(text);
          new Notice(t("modal.diagnostics.copied"), 2000);
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
