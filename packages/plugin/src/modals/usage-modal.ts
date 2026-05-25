import { App, Modal, Notice, setIcon } from "obsidian";
import type { Feature, UsageSnapshot } from "@aether/core";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";
import { copyToClipboard } from "../ui/clipboard.js";

const FEATURE_ORDER: Feature[] = [
  "inbox_metadata",
  "embedding",
  "summarize",
  "rewrite",
  "extract",
  "critique",
  "answer",
  "chat",
];

export class UsageModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("aether-usage-modal");
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    const snapshot = normalizeUsageSnapshot(this.plugin.core.usage.snapshot());
    const budget = normalizeBudget(this.plugin.core.settings.current.budgets.monthlyTokenWarn);
    const total = tokenTotal(snapshot.monthTotal);
    const overBudget = budget !== null && total >= budget;

    const header = this.contentEl.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "wallet-cards");
    header.createDiv({ cls: "aether-result-header-title", text: t("modal.usage.title") });

    const overview = this.contentEl.createDiv({ cls: "aether-usage-overview" });
    this.renderMetric(overview, t("modal.usage.total"), formatNumber(total));
    this.renderMetric(
      overview,
      t("modal.usage.prompt"),
      formatNumber(snapshot.monthTotal.promptTokens),
    );
    this.renderMetric(
      overview,
      t("modal.usage.completion"),
      formatNumber(snapshot.monthTotal.completionTokens),
    );

    const budgetEl = this.contentEl.createDiv({
      cls: `aether-usage-budget${overBudget ? " is-over" : ""}`,
    });
    budgetEl.createDiv({
      cls: "aether-usage-budget-title",
      text:
        budget === null
          ? t("modal.usage.budgetUnset")
          : t("modal.usage.budget", { used: formatNumber(total), budget: formatNumber(budget) }),
    });
    budgetEl.createDiv({
      cls: "aether-usage-budget-note",
      text: t("modal.usage.providerReported"),
    });
    if (budget !== null) {
      const pct = Math.min(100, Math.round((total / Math.max(1, budget)) * 100));
      const bar = budgetEl.createDiv({ cls: "aether-usage-budget-bar" });
      bar.createDiv({ cls: "aether-usage-budget-fill" }).style.width = `${pct}%`;
      budgetEl.createDiv({
        cls: "aether-usage-budget-note",
        text: overBudget ? t("modal.usage.budgetOver") : t("modal.usage.budgetUsed", { pct }),
      });
    } else {
      budgetEl.createDiv({ cls: "aether-usage-budget-note", text: t("modal.usage.budgetHint") });
    }

    this.renderFeatures(snapshot);
    this.renderActions(snapshot, budget);
  }

  private renderMetric(parent: HTMLElement, label: string, value: string): void {
    const item = parent.createDiv({ cls: "aether-usage-metric" });
    item.createDiv({ cls: "aether-usage-metric-value", text: value });
    item.createDiv({ cls: "aether-usage-metric-label", text: label });
  }

  private renderFeatures(snapshot: UsageSnapshot): void {
    this.contentEl.createDiv({
      cls: "aether-import-result-section-title",
      text: t("modal.usage.byFeature"),
    });
    const list = this.contentEl.createDiv({ cls: "aether-usage-feature-list" });
    let rendered = 0;
    for (const feature of FEATURE_ORDER) {
      const usage = snapshot.perFeature[feature];
      if (!usage) continue;
      rendered += 1;
      const row = list.createDiv({ cls: "aether-usage-feature-row" });
      row.createDiv({
        cls: "aether-usage-feature-name",
        text: t(`modal.usage.feature.${feature}`),
      });
      row.createDiv({
        cls: "aether-usage-feature-total",
        text: t("modal.usage.featureTotal", { total: formatNumber(tokenTotal(usage)) }),
      });
      row.createDiv({
        cls: "aether-usage-feature-detail",
        text: t("modal.usage.featureDetail", {
          prompt: formatNumber(usage.promptTokens),
          completion: formatNumber(usage.completionTokens),
        }),
      });
    }
    if (rendered === 0) {
      list.createDiv({ cls: "aether-hub-empty", text: t("modal.usage.empty") });
    }
  }

  private renderActions(snapshot: UsageSnapshot, budget: number | null): void {
    const actions = this.contentEl.createDiv({ cls: "aether-result-actions" });
    const copyBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("modal.usage.copyJson"),
    });
    copyBtn.onclick = async () => {
      await copyToClipboard(JSON.stringify({ budget, usage: snapshot }, null, 2), {
        successMessage: t("modal.usage.copied"),
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

function tokenTotal(value: { promptTokens: number; completionTokens: number }): number {
  return value.promptTokens + value.completionTokens;
}

function normalizeUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  const perFeature: UsageSnapshot["perFeature"] = {} as UsageSnapshot["perFeature"];
  for (const [feature, usage] of Object.entries(snapshot.perFeature)) {
    perFeature[feature as Feature] = {
      promptTokens: normalizeTokenCount(usage.promptTokens),
      completionTokens: normalizeTokenCount(usage.completionTokens),
    };
  }

  return {
    ...snapshot,
    monthTotal: {
      promptTokens: normalizeTokenCount(snapshot.monthTotal.promptTokens),
      completionTokens: normalizeTokenCount(snapshot.monthTotal.completionTokens),
    },
    perFeature,
  };
}

function normalizeTokenCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeBudget(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}
