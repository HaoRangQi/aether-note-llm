import { App, Modal, Notice, Setting } from "obsidian";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";
import { listJobHistory } from "../job-history.js";
import { createDiagnosticsReport } from "../diagnostics-report.js";
import { copyToClipboard } from "../ui/clipboard.js";

export class DiagnosticsModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("modal.diagnostics.title") });
    const recentJobs = await listJobHistory(this.plugin);
    const report = createDiagnosticsReport({
      pluginVersion: this.plugin.manifest.version,
      obsidianApi: this.plugin.manifest.minAppVersion,
      indexCount: this.plugin.core.store.allNotes().length,
      chunkCount: this.plugin.core.store.allChunks().length,
      pendingInbox: this.plugin.core.inbox.listItems({ status: "pending" }).length,
      recentJobs,
      settings: this.plugin.core.settings.current,
      usage: this.plugin.core.usage.snapshot(),
    });
    const text = JSON.stringify(report, null, 2);
    const pre = this.contentEl.createEl("pre");
    pre.setText(text);
    new Setting(this.contentEl).addButton((b) =>
      b
        .setButtonText(t("modal.diagnostics.copy"))
        .setCta()
        .onClick(async () => {
          await copyToClipboard(text, {
            successMessage: t("modal.diagnostics.copied"),
            notify: (message, timeoutMs) => new Notice(message, timeoutMs),
          });
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
