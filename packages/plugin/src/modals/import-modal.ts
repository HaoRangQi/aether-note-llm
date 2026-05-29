import { App, Modal, Notice, setIcon } from "obsidian";
import type AetherPlugin from "../main.js";
import type { ImportSource, InboxItem, Note } from "@aether/core";
import { JobTracker } from "../ui/job-tracker.js";
import { t } from "../i18n/index.js";
import { appendJobHistory } from "../job-history.js";
import {
  NEW_IMPORT_PREVIEW_POLICY,
  PENDING_IMPORT_PREVIEW_POLICY,
  type ImportPreviewPolicy,
  shouldDiscardRemainingImportItemOnCancel,
  shouldDiscardUnselectedImportItem,
} from "../ui/import-preview-policy.js";
import {
  buildImportSourceFromFile,
  buildImportSourceFromPaste,
  IMPORT_DIRECTORY_ACCEPT,
  IMPORT_FILE_ACCEPT,
} from "../ui/import-source.js";
import {
  listDirectoryMarkdownFiles,
  runDirectoryImportJob,
  type DirectoryImportFileLike,
} from "../ui/directory-import.js";

type Mode = "paste" | "file" | "directory";
type ImportTarget = "public" | "private";

interface ImportedNoteSummary {
  noteId: string;
  vaultPath: string;
  title: string;
}

interface MergedNoteSummary {
  noteId: string;
  vaultPath: string;
  title: string;
  sourceTitle: string;
}

interface ImportFailureSummary {
  title: string;
  sourceRef: string;
  message: string;
  retainedItemId?: string;
  retained?: boolean;
}

type ImportDecision = "create" | "merge" | "discard";

export function getPendingImportItems(plugin: AetherPlugin): InboxItem[] {
  return plugin.core.inbox
    .listItems({ status: "pending" })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function openPendingImportItems(app: App, plugin: AetherPlugin): boolean {
  const items = getPendingImportItems(plugin);
  if (items.length === 0) {
    new Notice(t("modal.importPending.empty"), 3000);
    return false;
  }
  new ImportPreviewModal(app, plugin, items, [], PENDING_IMPORT_PREVIEW_POLICY, {
    title: t("modal.importPending.title"),
    summaryKey: "modal.importPending.summary",
  }).open();
  return true;
}

export class ImportModal extends Modal {
  private text = "";
  private mode: Mode = "paste";
  private privacyTarget: ImportTarget;

  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
    this.privacyTarget = defaultImportTarget(plugin);
  }

  onOpen(): void {
    this.modalEl.addClass("aether-import-modal");
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();

    // —— 标题行 ——
    const header = el.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "download");
    header.createDiv({ cls: "aether-result-header-title", text: t("modal.import.title") });

    // —— 模式 Tab ——
    const tabBar = el.createDiv({ cls: "aether-import-tabs" });
    const mkTab = (m: Mode, icon: string, label: string): void => {
      const tab = tabBar.createDiv({ cls: `aether-import-tab${this.mode === m ? " active" : ""}` });
      const iconEl2 = tab.createSpan({ cls: "aether-import-tab-icon" });
      setIcon(iconEl2, icon);
      tab.createSpan({ text: label });
      tab.onclick = () => {
        this.mode = m;
        this.render();
      };
    };
    mkTab("paste", "clipboard-paste", t("modal.import.tab.paste"));
    mkTab("file", "file-up", t("modal.import.tab.file"));
    mkTab("directory", "folder-down", t("modal.import.tab.directory"));
    this.renderTargetSwitch(el);

    // —— 内容区 ——
    const body = el.createDiv({ cls: "aether-import-body" });
    if (this.mode === "paste") {
      this.renderPaste(body);
    } else if (this.mode === "file") {
      this.renderFile(body);
    } else {
      this.renderDirectory(body);
    }
  }

  private renderTargetSwitch(root: HTMLElement): void {
    const panel = root.createDiv({
      cls: `aether-import-target-panel${
        this.privacyTarget === "private" ? " is-private" : " is-public"
      }`,
    });

    const header = panel.createDiv({ cls: "aether-import-target-panel__header" });
    const titleWrap = header.createDiv({ cls: "aether-import-target-panel__title-wrap" });
    titleWrap.createDiv({
      cls: "aether-import-target-panel__eyebrow",
      text: t("modal.import.target.title"),
    });
    titleWrap.createDiv({
      cls: "aether-import-target-panel__title",
      text:
        this.privacyTarget === "private"
          ? t("modal.import.target.privateTitle")
          : t("modal.import.target.publicTitle"),
    });
    const bar = header.createDiv({ cls: "aether-import-target-switch" });
    const mk = (target: ImportTarget, label: string): void => {
      const btn = bar.createEl("button", {
        cls: `aether-import-target-btn${this.privacyTarget === target ? " active" : ""}`,
        text: label,
      });
      btn.onclick = () => {
        void this.switchTarget(target);
      };
    };
    mk("private", t("modal.import.target.private"));
    mk("public", t("modal.import.target.public"));

    if (this.privacyTarget === "private") {
      const warning = panel.createDiv({ cls: "aether-import-target-warning" });
      const icon = warning.createSpan({ cls: "aether-import-target-warning__icon" });
      setIcon(icon, "shield-alert");
      const copy = warning.createDiv({ cls: "aether-import-target-warning__copy" });
      copy.createDiv({
        cls: "aether-import-target-warning__title",
        text: t("modal.import.target.privateWarningTitle"),
      });
      copy.createDiv({
        cls: "aether-import-target-warning__desc",
        text: t("modal.import.target.privateHint"),
      });
    } else {
      const hint = panel.createDiv({ cls: "aether-import-target-hint" });
      const icon = hint.createSpan({ cls: "aether-import-target-hint__icon" });
      setIcon(icon, "globe-2");
      hint.createSpan({
        cls: "aether-import-target-hint__text",
        text: t("modal.import.target.publicHint"),
      });
    }
  }

  private async switchTarget(target: ImportTarget): Promise<void> {
    if (target === this.privacyTarget) return;
    if (target === "public") {
      const confirmFn =
        typeof window.confirm === "function" ? window.confirm.bind(window) : () => true;
      const confirmed = confirmFn(t("modal.import.target.publicConfirm"));
      if (!confirmed) return;
    }
    this.privacyTarget = target;
    await this.persistImportTarget(target);
    this.render();
  }

  private async persistImportTarget(target: ImportTarget): Promise<void> {
    if (this.plugin.core.settings.current.privacy.importLastTarget === target) return;
    const next = structuredClone(this.plugin.core.settings.current);
    next.privacy.importLastTarget = target;
    await this.plugin.core.settings.save(next);
    this.plugin.core.applySettings(next);
  }

  // ---- 粘贴文本 ----
  private renderPaste(body: HTMLElement): void {
    const ta = body.createEl("textarea", { cls: "aether-import-textarea" });
    ta.placeholder = t("modal.import.field");
    ta.rows = 10;
    ta.value = this.text;
    ta.addEventListener("input", () => (this.text = ta.value));
    // 自动聚焦
    window.setTimeout(() => ta.focus(), 50);

    this.renderActions(body, async () => {
      if (!this.text.trim()) {
        new Notice(t("modal.import.empty"), 3000);
        return false;
      }
      const source = buildImportSourceFromPaste(this.text, `paste-${Date.now()}`);
      this.close();
      await this.runImport(source);
      return true;
    });
  }

  // ---- 文件导入 ----
  private renderFile(body: HTMLElement): void {
    body.createEl("p", {
      cls: "aether-import-file-desc",
      text: t("modal.import.file.desc"),
    });

    // 拖放 / 点击上传区
    const dropZone = body.createDiv({ cls: "aether-import-dropzone" });
    const dzIcon = dropZone.createDiv({ cls: "aether-import-dropzone-icon" });
    setIcon(dzIcon, "file-up");
    const dzLabel = dropZone.createDiv({ cls: "aether-import-dropzone-label" });
    dzLabel.setText(t("modal.import.file.noFile"));

    const fileInput = body.createEl("input");
    fileInput.type = "file";
    fileInput.accept = IMPORT_FILE_ACCEPT;
    fileInput.style.display = "none";

    let fileContent = "";
    let fileName = "";

    const loadFile = (f: File): void => {
      fileName = f.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        fileContent = (e.target?.result as string) ?? "";
        dropZone.addClass("has-file");
        dzLabel.setText(t("modal.import.file.ready", { name: fileName }));
      };
      reader.readAsText(f, "utf-8");
    };

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files?.[0];
      if (f) loadFile(f);
    };

    // 拖放支持
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.addClass("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.removeClass("drag-over"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.removeClass("drag-over");
      const f = e.dataTransfer?.files?.[0];
      if (f) loadFile(f);
    });

    this.renderActions(body, async () => {
      if (!fileContent) {
        new Notice(t("modal.import.file.noFile"), 3000);
        return false;
      }
      const source = buildImportSourceFromFile(fileContent, fileName);
      if (!source) {
        new Notice(t("modal.import.file.unknown"), 4000);
        return false;
      }
      this.close();
      await this.runImport(source);
      return true;
    });
  }

  // ---- 目录导入 ----
  private renderDirectory(body: HTMLElement): void {
    body.createEl("p", {
      cls: "aether-import-file-desc",
      text: t("modal.import.directory.desc"),
    });

    const dropZone = body.createDiv({ cls: "aether-import-dropzone" });
    const dzIcon = dropZone.createDiv({ cls: "aether-import-dropzone-icon" });
    setIcon(dzIcon, "folder-down");
    const dzLabel = dropZone.createDiv({ cls: "aether-import-dropzone-label" });
    dzLabel.setText(t("modal.import.directory.noFolder"));

    const directoryInput = body.createEl("input");
    directoryInput.type = "file";
    directoryInput.accept = IMPORT_DIRECTORY_ACCEPT;
    directoryInput.multiple = true;
    (directoryInput as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    directoryInput.style.display = "none";

    let directoryFiles: DirectoryImportFileLike[] = [];

    const updateSelection = (files: File[]): void => {
      directoryFiles = listDirectoryMarkdownFiles(files);
      if (directoryFiles.length > 0) {
        dropZone.addClass("has-file");
      } else {
        dropZone.removeClass("has-file");
      }
      dzLabel.setText(
        directoryFiles.length > 0
          ? t("modal.import.directory.ready", { count: directoryFiles.length })
          : t("modal.import.directory.noFolder"),
      );
    };

    dropZone.onclick = () => directoryInput.click();
    directoryInput.onchange = () => {
      updateSelection(Array.from(directoryInput.files ?? []));
    };

    const actions = body.createDiv({ cls: "aether-result-actions" });
    const cancelBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("common.cancel"),
    });
    cancelBtn.onclick = () => this.close();

    const importBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
    });
    const importIcon = importBtn.createSpan();
    setIcon(importIcon, "folder-down");
    importBtn.createSpan({ text: " " + t("modal.import.directory.button") });
    importBtn.onclick = () => {
      if (directoryFiles.length === 0) {
        new Notice(t("modal.import.directory.empty"), 3000);
        return;
      }
      const files = [...directoryFiles];
      this.close();
      void runDirectoryImportJob(this.plugin, files, { target: this.privacyTarget });
      new Notice(t("modal.import.directory.started", { count: files.length }), 4000);
    };
  }

  private renderActions(body: HTMLElement, onImport: () => Promise<boolean>): void {
    const actions = body.createDiv({ cls: "aether-result-actions" });
    const cancelBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("common.cancel"),
    });
    cancelBtn.onclick = () => this.close();

    const importBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
    });
    const importIcon = importBtn.createSpan();
    setIcon(importIcon, "download");
    importBtn.createSpan({ text: " " + t("modal.import.button") });
    importBtn.onclick = () => void onImport();
  }

  private async runImport(source: ImportSource): Promise<void> {
    const job = new JobTracker({
      title: t("modal.import.progress.title"),
      icon: "download",
      meta: source.label,
      cancellable: true,
    });

    const items: InboxItem[] = [];
    const failures: ImportFailureSummary[] = [];
    let hasError = false;
    let errorMsg = "";
    try {
      for await (const e of this.plugin.core.importSource(source, {
        signal: job.signal,
        privacyTarget: this.privacyTarget,
      })) {
        if (job.cancelled) break;
        if (e.type === "item-added") {
          items.push(e.item);
          // 实时更新计数（借用 meta 行）
          job.update(t("modal.import.progress.parsed", { count: items.length }));
        } else if (e.type === "error") {
          hasError = true;
          errorMsg = e.message;
          failures.push({
            title: source.label,
            sourceRef: source.label,
            message: e.message,
          });
          console.error("[Aether Import] Error:", e.message);
        } else if (e.type === "batch-truncated") {
          hasError = true;
          errorMsg = t("modal.import.truncated", { cap: e.cap });
          failures.push({
            title: source.label,
            sourceRef: source.label,
            message: errorMsg,
          });
        }
      }
      if (job.cancelled) {
        job.cancel(t("modal.import.cancelled"), 5000);
        return;
      }
      if (hasError && items.length === 0) {
        job.finish("error");
        new Notice(t("modal.import.failed", { error: errorMsg }), 6000);
        return;
      }
      if (items.length === 0) {
        job.finish("error");
        new Notice(t("modal.import.zero"), 5000);
        return;
      }
      job.finish("done");
      new ImportPreviewModal(
        this.app,
        this.plugin,
        items,
        failures,
        NEW_IMPORT_PREVIEW_POLICY,
        {},
        this.privacyTarget,
      ).open();
    } catch (e) {
      job.finish("error");
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Aborted") {
        new Notice(t("modal.import.cancelled"), 5000);
        return;
      }
      console.error("[Aether Import] Exception:", e);
      new Notice(t("modal.import.error", { error: msg }), 6000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ImportPreviewModal extends Modal {
  private readonly decisions = new Map<string, ImportDecision>();
  private readonly drafts = new Map<
    string,
    {
      proposedTitle: string;
      proposedSummary: string;
      proposedTagsText: string;
      proposedCategoryId: string;
    }
  >();
  private finalized = false;
  private working = false;

  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
    private readonly items: InboxItem[],
    private readonly parseFailures: ImportFailureSummary[],
    private readonly policy: ImportPreviewPolicy = NEW_IMPORT_PREVIEW_POLICY,
    private readonly copy: {
      title?: string;
      summaryKey?: string;
    } = {},
    private readonly privacyTarget: ImportTarget = "public",
  ) {
    super(app);
    for (const item of items) {
      this.decisions.set(item.id, this.defaultDecision(item));
      this.drafts.set(item.id, {
        proposedTitle: item.proposedTitle,
        proposedSummary: item.proposedSummary,
        proposedTagsText: item.proposedTags.join(", "),
        proposedCategoryId: item.proposedCategoryId,
      });
    }
  }

  onOpen(): void {
    this.modalEl.addClass("aether-import-preview-modal");
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();

    const header = el.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "list-checks");
    header.createDiv({
      cls: "aether-result-header-title",
      text: this.copy.title ?? t("modal.importPreview.title"),
    });

    el.createEl("p", {
      cls: "aether-import-result-summary",
      text: t(this.copy.summaryKey ?? "modal.importPreview.summary", {
        selected: this.selectedCount(),
        total: this.items.length,
        failed: this.parseFailures.length,
      }),
    });

    const toolbar = el.createDiv({ cls: "aether-import-preview-toolbar" });
    const allBtn = toolbar.createEl("button", {
      cls: "aether-result-btn",
      text: t("modal.importPreview.selectAll"),
    });
    allBtn.disabled = this.working;
    allBtn.onclick = () => {
      for (const item of this.items) this.decisions.set(item.id, this.defaultDecision(item));
      this.render();
    };
    const noneBtn = toolbar.createEl("button", {
      cls: "aether-result-btn",
      text: t("modal.importPreview.selectNone"),
    });
    noneBtn.disabled = this.working;
    noneBtn.onclick = () => {
      for (const item of this.items) this.decisions.set(item.id, "discard");
      this.render();
    };

    const list = el.createDiv({ cls: "aether-import-preview-list" });
    for (const item of this.items) {
      const decision = this.getDecision(item);
      const row = list.createDiv({
        cls: `aether-import-preview-row${decision !== "discard" ? " is-selected" : ""}`,
      });
      const checkbox = row.createEl("input", { cls: "aether-import-preview-checkbox" });
      checkbox.type = "checkbox";
      checkbox.checked = decision !== "discard";
      checkbox.disabled = this.working;
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.decisions.set(item.id, this.defaultDecision(item));
        } else {
          this.decisions.set(item.id, "discard");
        }
        this.render();
      };
      const main = row.createDiv({ cls: "aether-import-result-main" });
      const draft = this.getDraft(item);
      this.renderEditableField(main, {
        label: t("modal.importPreview.field.title"),
        value: draft.proposedTitle || item.sourceRef || item.id,
        className: "aether-import-preview-title-input",
        onInput: (value) => {
          draft.proposedTitle = value;
        },
      });
      main.createDiv({ cls: "aether-import-result-path", text: item.sourceRef });
      this.renderEditableField(main, {
        label: t("modal.importPreview.field.summary"),
        value: draft.proposedSummary,
        className: "aether-import-preview-summary-input",
        multiline: true,
        onInput: (value) => {
          draft.proposedSummary = value;
        },
      });
      const meta = main.createDiv({ cls: "aether-import-preview-meta" });
      meta.createSpan({ text: item.kind });
      this.renderEditableField(main, {
        label: t("modal.importPreview.field.tags"),
        value: draft.proposedTagsText,
        className: "aether-import-preview-tags-input",
        onInput: (value) => {
          draft.proposedTagsText = value;
        },
      });
      this.renderCategoryField(main, item, draft);
      main.createDiv({
        cls: "aether-import-result-path",
        text: this.previewTargetPath(item, draft),
      });
      if (item.duplicateOf) {
        meta.createSpan({
          cls: "aether-import-preview-duplicate",
          text: t("modal.importPreview.duplicate"),
        });
        this.renderDuplicateDecision(main, item);
      }
    }

    if (this.parseFailures.length > 0) {
      el.createDiv({
        cls: "aether-import-result-section-title",
        text: t("modal.importResult.failuresTitle", { count: this.parseFailures.length }),
      });
      el.createDiv({
        cls: "aether-import-result-failure-hint",
        text: t("modal.importPreview.parseFailuresNotRetained"),
      });
      const failureList = el.createDiv({ cls: "aether-import-result-failure-list" });
      for (const failure of this.parseFailures) {
        const row = failureList.createDiv({
          cls: "aether-import-result-row aether-import-result-row--failed",
        });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({ cls: "aether-import-result-title", text: failure.title });
        if (failure.sourceRef)
          main.createDiv({ cls: "aether-import-result-path", text: failure.sourceRef });
        main.createDiv({ cls: "aether-import-result-error", text: failure.message });
      }
    }

    const actions = el.createDiv({ cls: "aether-result-actions" });
    const cancelBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--danger",
      text: t("modal.importPreview.discardAll"),
    });
    cancelBtn.disabled = this.working;
    cancelBtn.onclick = () => void this.discardAndClose();

    const importBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: this.working
        ? t("modal.importPreview.importing")
        : t("modal.importPreview.importSelected", { count: this.selectedCount() }),
    });
    importBtn.disabled = this.working || this.selectedCount() === 0;
    importBtn.onclick = () => void this.importSelected();
  }

  private async importSelected(): Promise<void> {
    if (this.working) return;
    if (this.selectedCount() === 0) {
      new Notice(t("modal.importPreview.noneSelected"), 3000);
      return;
    }

    this.working = true;
    this.finalized = true;
    this.render();

    const imported: ImportedNoteSummary[] = [];
    const merged: MergedNoteSummary[] = [];
    const failures = [...this.parseFailures];
    const retainedFailureItemIds = new Set<string>();
    const selectedTotal = this.selectedCount();
    let processed = 0;
    const job = new JobTracker({
      title: t("job.import.title"),
      icon: "download",
      meta: t("job.import.writing", { done: processed, total: selectedTotal }),
      cancellable: true,
    });
    for (const item of this.items) {
      const decision = this.getDecision(item);
      if (decision === "discard") {
        if (!shouldDiscardUnselectedImportItem(this.policy)) continue;
        try {
          await this.plugin.core.discardInboxItem(item.id);
        } catch (e) {
          console.error("[Aether Import] Discard skipped item failed:", item.id, e);
        }
        continue;
      }
      if (job.cancelled) {
        if (shouldDiscardRemainingImportItemOnCancel(this.policy)) {
          await this.discardRemainingPendingItems(retainedFailureItemIds);
        }
        try {
          await this.plugin.openHubAndRefresh();
        } catch (e) {
          console.error("[Aether Import] Hub refresh failed:", e);
        }
        await this.recordImportJob(job, "cancelled", {
          selectedTotal,
          processed,
          imported,
          merged,
          failures,
        });
        job.cancel(t("job.import.cancelled", { done: processed, total: selectedTotal }), 5000);
        this.close();
        new ImportResultModal(this.app, this.plugin, imported, merged, failures).open();
        return;
      }
      processed += 1;
      job.update(t("job.import.writing", { done: processed, total: selectedTotal }));
      try {
        await this.syncDraft(item);
        if (decision === "merge" && item.duplicateOf) {
          const note = await this.plugin.core.mergeInboxItem(item.id, item.duplicateOf);
          merged.push({
            noteId: note.id,
            vaultPath: note.vaultPath,
            title: note.title,
            sourceTitle: this.getDraft(item).proposedTitle || item.proposedTitle || item.sourceRef,
          });
        } else {
          const note = await this.plugin.core.approveInboxItem(item.id, {
            target: this.privacyTarget,
          });
          imported.push({
            noteId: note.id,
            vaultPath: note.vaultPath,
            title: note.title,
          });
        }
      } catch (e) {
        const draft = this.getDraft(item);
        retainedFailureItemIds.add(item.id);
        failures.push({
          title: draft.proposedTitle || item.proposedTitle || item.sourceRef || item.id,
          sourceRef: item.sourceRef,
          message: e instanceof Error ? e.message : String(e),
          retainedItemId: item.id,
          retained: true,
        });
        console.error("[Aether Import] Write failed:", e);
      }
    }

    try {
      await this.plugin.openHubAndRefresh();
    } catch (e) {
      console.error("[Aether Import] Hub refresh failed:", e);
    }
    await this.recordImportJob(job, failures.length > 0 ? "failed" : "done", {
      selectedTotal,
      processed,
      imported,
      merged,
      failures,
    });
    job.finish("done");
    this.close();
    new ImportResultModal(this.app, this.plugin, imported, merged, failures).open();
  }

  private selectedCount(): number {
    return this.items.filter((item) => this.getDecision(item) !== "discard").length;
  }

  private getDecision(item: InboxItem): ImportDecision {
    return this.decisions.get(item.id) ?? this.defaultDecision(item);
  }

  private defaultDecision(item: InboxItem): ImportDecision {
    return item.duplicateOf && this.getMergeTarget(item) ? "merge" : "create";
  }

  private getMergeTarget(item: InboxItem): Note | null {
    return item.duplicateOf ? (this.plugin.core.store.getNote(item.duplicateOf) ?? null) : null;
  }

  private renderDuplicateDecision(parent: HTMLElement, item: InboxItem): void {
    const target = this.getMergeTarget(item);
    const wrap = parent.createDiv({ cls: "aether-import-duplicate-panel" });
    const targetText = target
      ? t("modal.importPreview.duplicateTarget", { title: target.title || target.vaultPath })
      : t("modal.importPreview.duplicateTargetMissing");
    wrap.createDiv({ cls: "aether-import-duplicate-target", text: targetText });
    if (target?.vaultPath) {
      wrap.createDiv({ cls: "aether-import-duplicate-path", text: target.vaultPath });
    }
    const actions = wrap.createDiv({ cls: "aether-import-duplicate-actions" });
    this.renderDecisionButton(
      actions,
      item,
      "merge",
      t("modal.importPreview.action.merge"),
      !target,
    );
    this.renderDecisionButton(actions, item, "create", t("modal.importPreview.action.create"));
    this.renderDecisionButton(actions, item, "discard", t("modal.importPreview.action.discard"));
  }

  private renderDecisionButton(
    parent: HTMLElement,
    item: InboxItem,
    decision: ImportDecision,
    label: string,
    disabled = false,
  ): void {
    const active = this.getDecision(item) === decision;
    const btn = parent.createEl("button", {
      cls: `aether-import-decision-btn${active ? " is-active" : ""}`,
      text: label,
    });
    btn.disabled = this.working || disabled;
    btn.onclick = () => {
      this.decisions.set(item.id, decision);
      this.render();
    };
  }

  private getDraft(item: InboxItem): {
    proposedTitle: string;
    proposedSummary: string;
    proposedTagsText: string;
    proposedCategoryId: string;
  } {
    let draft = this.drafts.get(item.id);
    if (!draft) {
      draft = {
        proposedTitle: item.proposedTitle,
        proposedSummary: item.proposedSummary,
        proposedTagsText: item.proposedTags.join(", "),
        proposedCategoryId: item.proposedCategoryId,
      };
      this.drafts.set(item.id, draft);
    }
    return draft;
  }

  private renderCategoryField(
    parent: HTMLElement,
    item: InboxItem,
    draft: {
      proposedCategoryId: string;
    },
  ): void {
    const wrap = parent.createDiv({ cls: "aether-import-preview-field" });
    wrap.createDiv({
      cls: "aether-import-preview-field-label",
      text: t("modal.importPreview.field.category"),
    });
    const select = wrap.createEl("select", { cls: "aether-import-preview-category-select" });
    const categories = this.plugin.core.settings.current.importing.categories;
    for (const category of categories) {
      const option = select.createEl("option", { text: category.label });
      option.value = category.id;
    }
    select.value = categories.some((category) => category.id === draft.proposedCategoryId)
      ? draft.proposedCategoryId
      : "other";
    select.disabled = this.working;
    select.onchange = () => {
      draft.proposedCategoryId = select.value;
      this.render();
    };
    if (item.duplicateOf) {
      wrap.createDiv({
        cls: "aether-import-target-hint",
        text: t("modal.importPreview.categoryMergeHint"),
      });
    }
  }

  private previewTargetPath(
    item: InboxItem,
    draft: { proposedTitle: string; proposedCategoryId: string },
  ): string {
    const settings = this.plugin.core.settings.current;
    const root =
      this.privacyTarget === "private"
        ? settings.privacy.privateInboxFolder
        : settings.ui.aetherInboxFolder;
    const category =
      settings.importing.categories.find((c) => c.id === draft.proposedCategoryId) ??
      settings.importing.categories.find((c) => c.id === "other");
    const folderName =
      category?.folderName ?? category?.label ?? t("modal.importPreview.categoryOther");
    const date = new Date(item.createdAt || Date.now());
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const title = draft.proposedTitle.trim() || item.proposedTitle || item.sourceRef || item.id;
    return t("modal.importPreview.targetPath", {
      path: `${root.replace(/\/+$/, "")}/${folderName}/${year}/${month}/…-${title}.md`,
    });
  }

  private renderEditableField(
    parent: HTMLElement,
    opts: {
      label: string;
      value: string;
      className: string;
      multiline?: boolean;
      onInput: (value: string) => void;
    },
  ): void {
    const wrap = parent.createDiv({ cls: "aether-import-preview-field" });
    wrap.createDiv({ cls: "aether-import-preview-field-label", text: opts.label });
    if (opts.multiline) {
      const input = wrap.createEl("textarea", { cls: opts.className });
      input.value = opts.value;
      input.rows = 2;
      input.disabled = this.working;
      input.addEventListener("input", () => opts.onInput(input.value));
    } else {
      const input = wrap.createEl("input", { cls: opts.className });
      input.type = "text";
      input.value = opts.value;
      input.disabled = this.working;
      input.addEventListener("input", () => opts.onInput(input.value));
    }
  }

  private async syncDraft(item: InboxItem): Promise<void> {
    const draft = this.getDraft(item);
    await this.plugin.core.updateInboxItemDraft(item.id, {
      proposedTitle: draft.proposedTitle.trim() || item.sourceRef || item.id,
      proposedSummary: draft.proposedSummary,
      proposedTags: parseTags(draft.proposedTagsText),
      proposedCategoryId: draft.proposedCategoryId,
    });
  }

  private async recordImportJob(
    job: JobTracker,
    status: "done" | "failed" | "cancelled",
    result: {
      selectedTotal: number;
      processed: number;
      imported: ImportedNoteSummary[];
      merged: MergedNoteSummary[];
      failures: ImportFailureSummary[];
    },
  ): Promise<void> {
    await appendJobHistory(this.plugin, {
      kind: "import-write",
      title: t("job.import.title"),
      status,
      startedAt: job.startedAt,
      finishedAt: Date.now(),
      summary: {
        selected: result.selectedTotal,
        processed: result.processed,
        imported: result.imported.length,
        merged: result.merged.length,
        failed: result.failures.length,
        cancelled: status === "cancelled",
      },
      failures: result.failures.map((f) => ({
        title: f.title,
        path: f.sourceRef,
        message: f.message,
      })),
    });
  }

  private async discardAndClose(): Promise<void> {
    if (this.working) return;
    this.working = true;
    this.finalized = true;
    this.render();
    await this.discardPendingItems();
    new Notice(t("modal.importPreview.discarded", { count: this.items.length }), 4000);
    await this.plugin.openHubAndRefresh();
    this.close();
  }

  private async discardPendingItems(): Promise<void> {
    for (const item of this.items) {
      try {
        await this.plugin.core.discardInboxItem(item.id);
      } catch (e) {
        console.error("[Aether Import] Discard failed:", item.id, e);
      }
    }
  }

  private async discardRemainingPendingItems(
    retainItemIds: ReadonlySet<string> = new Set<string>(),
  ): Promise<void> {
    for (const item of this.items) {
      if (retainItemIds.has(item.id)) continue;
      if (this.plugin.core.inbox.getItem(item.id)?.status !== "pending") continue;
      try {
        await this.plugin.core.discardInboxItem(item.id);
      } catch (e) {
        console.error("[Aether Import] Discard remaining item failed:", item.id, e);
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.policy.discardOnClose) return;
    if (!this.finalized && !this.working) {
      this.finalized = true;
      void this.discardPendingItems();
    }
  }
}

class ImportResultModal extends Modal {
  private undone = false;

  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
    private readonly imported: ImportedNoteSummary[],
    private readonly merged: MergedNoteSummary[],
    private readonly failures: ImportFailureSummary[],
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("aether-import-result-modal");
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();

    const header = el.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "check-circle");
    header.createDiv({ cls: "aether-result-header-title", text: t("modal.importResult.title") });

    el.createEl("p", {
      cls: "aether-import-result-summary",
      text:
        this.failures.length > 0
          ? t("modal.importResult.summaryWithFailures", {
              count: this.imported.length,
              merged: this.merged.length,
              failed: this.failures.length,
            })
          : t("modal.importResult.summary", {
              count: this.imported.length,
              merged: this.merged.length,
            }),
    });

    if (this.imported.length > 0) {
      el.createDiv({
        cls: "aether-import-result-section-title",
        text: t("modal.importResult.createdTitle", { count: this.imported.length }),
      });
      const list = el.createDiv({ cls: "aether-import-result-list" });
      for (const item of this.imported) {
        const row = list.createDiv({ cls: "aether-import-result-row" });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({ cls: "aether-import-result-title", text: item.title || item.vaultPath });
        main.createDiv({ cls: "aether-import-result-path", text: item.vaultPath });
        const openBtn = row.createEl("button", {
          cls: "aether-result-btn",
          text: t("modal.importResult.open"),
        });
        openBtn.onclick = () => {
          void this.openVaultPath(item.vaultPath);
        };
      }
    }

    if (this.merged.length > 0) {
      el.createDiv({
        cls: "aether-import-result-section-title",
        text: t("modal.importResult.mergedTitle", { count: this.merged.length }),
      });
      const list = el.createDiv({ cls: "aether-import-result-list" });
      for (const item of this.merged) {
        const row = list.createDiv({ cls: "aether-import-result-row" });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({
          cls: "aether-import-result-title",
          text: t("modal.importResult.mergedItem", {
            source: item.sourceTitle,
            title: item.title || item.vaultPath,
          }),
        });
        main.createDiv({ cls: "aether-import-result-path", text: item.vaultPath });
        const openBtn = row.createEl("button", {
          cls: "aether-result-btn",
          text: t("modal.importResult.open"),
        });
        openBtn.onclick = () => {
          void this.openVaultPath(item.vaultPath);
        };
      }
    }

    const retainedFailures = this.failures.filter((failure) => failure.retained);
    const parseFailures = this.failures.filter((failure) => !failure.retained);

    if (this.failures.length > 0) {
      el.createDiv({
        cls: "aether-import-result-section-title",
        text: t("modal.importResult.failuresTitle", { count: this.failures.length }),
      });
      if (retainedFailures.length > 0) {
        el.createDiv({
          cls: "aether-import-result-failure-hint",
          text: t("modal.importResult.failuresRetained"),
        });
      }
      if (parseFailures.length > 0) {
        el.createDiv({
          cls: "aether-import-result-failure-hint",
          text: t("modal.importResult.parseFailuresNotRetained"),
        });
      }
      const failureList = el.createDiv({ cls: "aether-import-result-failure-list" });
      for (const failure of this.failures) {
        const row = failureList.createDiv({
          cls: "aether-import-result-row aether-import-result-row--failed",
        });
        const main = row.createDiv({ cls: "aether-import-result-main" });
        main.createDiv({ cls: "aether-import-result-title", text: failure.title });
        if (failure.sourceRef) {
          main.createDiv({ cls: "aether-import-result-path", text: failure.sourceRef });
        }
        main.createDiv({ cls: "aether-import-result-error", text: failure.message });
      }
    }

    const actions = el.createDiv({ cls: "aether-result-actions" });
    const undoBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--danger",
      text: t("modal.importResult.undo"),
    });
    undoBtn.disabled = this.imported.length === 0;
    if (this.merged.length > 0) {
      undoBtn.title = t("modal.importResult.undoCreatedOnly");
    }
    undoBtn.onclick = () => void this.undoImport(undoBtn);

    if (retainedFailures.length > 0) {
      const pendingBtn = actions.createEl("button", {
        cls: "aether-result-btn",
        text: t("modal.importResult.reviewPending"),
      });
      pendingBtn.onclick = () => {
        this.close();
        openPendingImportItems(this.app, this.plugin);
      };
    }

    const closeBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: t("common.close"),
    });
    closeBtn.onclick = () => this.close();
  }

  private async openVaultPath(vaultPath: string): Promise<void> {
    try {
      await this.app.workspace.openLinkText(vaultPath, "", false);
    } catch (e) {
      new Notice(t("modal.importResult.openFailed", { error: (e as Error).message }), 5000);
    }
  }

  private async undoImport(button: HTMLButtonElement): Promise<void> {
    if (this.undone) return;
    this.undone = true;
    button.disabled = true;
    button.setText(t("modal.importResult.undoing"));
    let removed = 0;
    for (const item of this.imported) {
      try {
        await this.plugin.core.deleteNote(item.noteId);
        removed += 1;
      } catch (e) {
        console.error("[Aether Import] Undo failed:", item.vaultPath, e);
      }
    }
    new Notice(t("modal.importResult.undone", { count: removed }), 5000);
    await this.plugin.openHubAndRefresh();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function parseTags(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter((tag, idx, arr) => tag.length > 0 && arr.indexOf(tag) === idx)
    .slice(0, 12);
}

function defaultImportTarget(plugin: AetherPlugin): ImportTarget {
  return plugin.core.settings.current.privacy.importLastTarget ?? "private";
}
