import { App, Modal, Setting } from "obsidian";
import type AetherPlugin from "../main.js";

export class DiagnosticsModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Diagnostics" });
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
        .setButtonText("Copy to clipboard")
        .setCta()
        .onClick(async () => {
          await navigator.clipboard.writeText(text);
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
