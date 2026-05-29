import { Modal, Notice, setIcon } from "obsidian";
import type {
  ImportOrganizePlan,
  ImportOrganizePlanItem,
  ImportOrganizeApplyResult,
} from "@aether/core";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";
import { JobTracker } from "../ui/job-tracker.js";

interface OrganizeDraft {
  rootFolder: string;
  fromMonth: string;
  toMonth: string;
}

export class OrganizeImportsModal extends Modal {
  private draft: OrganizeDraft;
  private plan: ImportOrganizePlan | null = null;
  private selected = new Set<string>();
  private working = false;
  private result: ImportOrganizeApplyResult | null = null;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
    this.draft = {
      rootFolder: plugin.core.settings.current.ui.aetherInboxFolder,
      fromMonth: "",
      toMonth: "",
    };
  }

  onOpen(): void {
    this.modalEl.addClass("aether-organize-imports-modal");
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    const header = el.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "folder-tree");
    header.createDiv({ cls: "aether-result-header-title", text: t("modal.organize.title") });

    if (this.result) {
      this.renderResult(el);
      return;
    }

    this.renderScopeForm(el);
    if (this.plan) this.renderPlan(el, this.plan);
    this.renderActions(el);
  }

  private renderScopeForm(el: HTMLElement): void {
    const form = el.createDiv({ cls: "aether-organize-form" });
    this.renderInput(form, t("modal.organize.rootFolder"), this.draft.rootFolder, (value) => {
      this.draft.rootFolder = value;
    });
    this.renderInput(form, t("modal.organize.fromMonth"), this.draft.fromMonth, (value) => {
      this.draft.fromMonth = value;
    });
    this.renderInput(form, t("modal.organize.toMonth"), this.draft.toMonth, (value) => {
      this.draft.toMonth = value;
    });
  }

  private renderInput(
    parent: HTMLElement,
    label: string,
    value: string,
    onInput: (value: string) => void,
  ): void {
    const wrap = parent.createDiv({ cls: "aether-import-preview-field" });
    wrap.createDiv({ cls: "aether-import-preview-field-label", text: label });
    const input = wrap.createEl("input");
    input.type = "text";
    input.value = value;
    input.disabled = this.working;
    input.addEventListener("input", () => onInput(input.value));
  }

  private renderPlan(el: HTMLElement, plan: ImportOrganizePlan): void {
    el.createDiv({
      cls: "aether-import-result-summary",
      text: t("modal.organize.previewSummary", { count: plan.items.length }),
    });
    const list = el.createDiv({ cls: "aether-import-preview-list" });
    for (const item of plan.items) {
      this.renderPlanItem(list, item);
    }
  }

  private renderPlanItem(parent: HTMLElement, item: ImportOrganizePlanItem): void {
    const row = parent.createDiv({
      cls: `aether-import-preview-row${this.selected.has(item.currentPath) ? " is-selected" : ""}`,
    });
    const checkbox = row.createEl("input", { cls: "aether-import-preview-checkbox" });
    checkbox.type = "checkbox";
    checkbox.checked = this.selected.has(item.currentPath);
    checkbox.disabled = this.working;
    checkbox.onchange = () => {
      if (checkbox.checked) this.selected.add(item.currentPath);
      else this.selected.delete(item.currentPath);
      this.render();
    };
    const main = row.createDiv({ cls: "aether-import-result-main" });
    main.createDiv({ cls: "aether-import-result-title", text: item.title || item.currentPath });
    main.createDiv({
      cls: "aether-import-result-path",
      text: t("modal.organize.itemCategory", { category: item.categoryLabel }),
    });
    main.createDiv({ cls: "aether-import-result-path", text: item.currentPath });
    main.createDiv({ cls: "aether-import-result-path", text: item.targetPath });
  }

  private renderActions(el: HTMLElement): void {
    const actions = el.createDiv({ cls: "aether-result-actions" });
    const previewBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: this.working ? t("modal.organize.previewing") : t("modal.organize.preview"),
    });
    previewBtn.disabled = this.working;
    previewBtn.onclick = () => void this.preview();

    const applyBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: this.working
        ? t("modal.organize.applying")
        : t("modal.organize.apply", { count: this.selected.size }),
    });
    applyBtn.disabled = this.working || !this.plan || this.selected.size === 0;
    applyBtn.onclick = () => void this.apply();

    const closeBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("common.close"),
    });
    closeBtn.disabled = this.working;
    closeBtn.onclick = () => this.close();
  }

  private renderResult(el: HTMLElement): void {
    const result = this.result!;
    el.createDiv({
      cls: "aether-import-result-summary",
      text: t("modal.organize.resultSummary", {
        moved: result.moved.length,
        failed: result.failures.length,
      }),
    });
    if (result.moved.length > 0) {
      const list = el.createDiv({ cls: "aether-import-result-list" });
      for (const item of result.moved) {
        const row = list.createDiv({ cls: "aether-import-result-row" });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({ cls: "aether-import-result-title", text: item.title || item.targetPath });
        main.createDiv({ cls: "aether-import-result-path", text: item.targetPath });
      }
    }
    if (result.failures.length > 0) {
      const list = el.createDiv({ cls: "aether-import-result-failure-list" });
      for (const failure of result.failures) {
        const row = list.createDiv({
          cls: "aether-import-result-row aether-import-result-row--failed",
        });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({ cls: "aether-import-result-title", text: failure.item.title });
        main.createDiv({ cls: "aether-import-result-path", text: failure.item.currentPath });
        main.createDiv({ cls: "aether-import-result-error", text: failure.message });
      }
    }
    const actions = el.createDiv({ cls: "aether-result-actions" });
    const closeBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: t("common.close"),
    });
    closeBtn.onclick = () => this.close();
  }

  private async preview(): Promise<void> {
    if (this.working) return;
    if (!this.draft.rootFolder.trim()) {
      new Notice(t("modal.organize.rootRequired"), 3000);
      return;
    }
    this.working = true;
    this.render();
    try {
      const plan = await this.plugin.core.previewOrganizeImports({
        rootFolder: this.draft.rootFolder.trim(),
        fromMonth: this.draft.fromMonth.trim() || null,
        toMonth: this.draft.toMonth.trim() || null,
      });
      this.plan = plan;
      this.selected = new Set(plan.items.map((item) => item.currentPath));
    } catch (e) {
      new Notice(t("modal.organize.previewFailed", { error: (e as Error).message }), 5000);
    } finally {
      this.working = false;
      this.render();
    }
  }

  private async apply(): Promise<void> {
    if (this.working || !this.plan) return;
    const items = this.plan.items.filter((item) => this.selected.has(item.currentPath));
    if (items.length === 0) return;
    this.working = true;
    this.render();
    const job = new JobTracker({
      title: t("job.organize.title"),
      icon: "folder-tree",
      meta: t("job.organize.running", { count: items.length }),
      cancellable: false,
    });
    try {
      this.result = await this.plugin.core.applyOrganizeImports({
        ...this.plan,
        items,
      });
      await this.plugin.openHubAndRefresh();
      job.finish("done");
    } catch (e) {
      job.fail((e as Error).message);
      new Notice(t("modal.organize.applyFailed", { error: (e as Error).message }), 5000);
    } finally {
      this.working = false;
      this.render();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
