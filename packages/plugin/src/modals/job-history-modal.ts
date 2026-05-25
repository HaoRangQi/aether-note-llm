import { App, Modal, Notice, setIcon } from "obsidian";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";
import { type JobHistoryEntry, listJobHistory } from "../job-history.js";
import { copyToClipboard } from "../ui/clipboard.js";

export class JobHistoryModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("aether-job-history-modal");
    void this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();

    const header = this.contentEl.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "list-checks");
    header.createDiv({ cls: "aether-result-header-title", text: t("modal.jobHistory.title") });

    const jobs = await listJobHistory(this.plugin);
    if (jobs.length === 0) {
      this.contentEl.createDiv({ cls: "aether-hub-empty", text: t("modal.jobHistory.empty") });
      this.renderActions(jobs);
      return;
    }

    const list = this.contentEl.createDiv({ cls: "aether-job-history-list" });
    for (const job of jobs) {
      this.renderJob(list, job);
    }
    this.renderActions(jobs);
  }

  private renderJob(parent: HTMLElement, job: JobHistoryEntry): void {
    const card = parent.createDiv({ cls: `aether-job-history-card is-${job.status}` });
    const header = card.createDiv({ cls: "aether-job-history-card-header" });
    const main = header.createDiv({ cls: "aether-job-history-card-main" });
    main.createDiv({
      cls: "aether-job-history-title",
      text: t(`modal.jobHistory.kind.${job.kind}`),
    });
    main.createDiv({
      cls: "aether-job-history-meta",
      text: t("modal.jobHistory.meta", {
        started: formatDateTime(job.startedAt),
        duration: formatDuration(job.finishedAt - job.startedAt),
      }),
    });
    header.createDiv({
      cls: `aether-job-history-status is-${job.status}`,
      text: t(`modal.jobHistory.status.${job.status}`),
    });

    const summary = card.createDiv({ cls: "aether-job-history-summary" });
    for (const [key, value] of Object.entries(job.summary)) {
      const pill = summary.createDiv({ cls: "aether-job-history-pill" });
      pill.createSpan({ cls: "aether-job-history-pill-key", text: key });
      pill.createSpan({ cls: "aether-job-history-pill-value", text: String(value) });
    }

    if (job.failures.length > 0) {
      card.createDiv({
        cls: "aether-import-result-section-title",
        text: t("modal.jobHistory.failuresTitle", { count: job.failures.length }),
      });
      const failures = card.createDiv({ cls: "aether-import-result-failure-list" });
      for (const failure of job.failures) {
        const row = failures.createDiv({
          cls: "aether-import-result-row aether-import-result-row--failed",
        });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({
          cls: "aether-import-result-title",
          text: failure.title || failure.path || t("modal.jobHistory.failure"),
        });
        if (failure.path) {
          main.createDiv({ cls: "aether-import-result-path", text: failure.path });
        }
        main.createDiv({ cls: "aether-import-result-error", text: failure.message });
      }
    }
  }

  private renderActions(jobs: JobHistoryEntry[]): void {
    const actions = this.contentEl.createDiv({ cls: "aether-result-actions" });
    const copyBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("modal.jobHistory.copyJson"),
    });
    copyBtn.disabled = jobs.length === 0;
    copyBtn.onclick = async () => {
      if (jobs.length === 0) return;
      await copyToClipboard(JSON.stringify(jobs, null, 2), {
        successMessage: t("modal.jobHistory.copied"),
        notify: (message, timeoutMs) => new Notice(message, timeoutMs),
      });
    };
    const closeBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: t("common.close"),
    });
    closeBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
