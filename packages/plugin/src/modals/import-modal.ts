import { App, Modal, Notice, setIcon } from "obsidian";
import type AetherPlugin from "../main.js";
import type { ImportSource } from "@aether/core";
import { t } from "../i18n/index.js";

type Mode = "paste" | "file";

export class ImportModal extends Modal {
  private text = "";
  private mode: Mode = "paste";

  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app);
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

    // —— 内容区 ——
    const body = el.createDiv({ cls: "aether-import-body" });
    if (this.mode === "paste") {
      this.renderPaste(body);
    } else {
      this.renderFile(body);
    }
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
      const source: ImportSource = {
        kind: "paste",
        label: `paste-${Date.now()}`,
        payload: { type: "paste-text", text: this.text },
      };
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
    fileInput.accept = ".itabdata,.json";
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
      const source = this.buildFileSource(fileContent, fileName);
      if (!source) {
        new Notice(t("modal.import.file.unknown"), 4000);
        return false;
      }
      this.close();
      await this.runImport(source);
      return true;
    });
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

  private buildFileSource(raw: string, fileName: string): ImportSource | null {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".itabdata")) {
      return { kind: "file", label: fileName, payload: { type: "itab-data", raw } };
    }
    if (lower.endsWith(".json")) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (Array.isArray(parsed.navConfig)) {
          return { kind: "file", label: fileName, payload: { type: "itab-data", raw } };
        }
        if (parsed.roots) {
          return { kind: "file", label: fileName, payload: { type: "bookmarks-json", raw } };
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  private async runImport(source: ImportSource): Promise<void> {
    const itemIds: string[] = [];
    let hasError = false;
    let errorMsg = "";
    try {
      for await (const e of this.plugin.core.importSource(source)) {
        if (e.type === "item-added") {
          itemIds.push(e.item.id);
        } else if (e.type === "error") {
          hasError = true;
          errorMsg = e.message;
          console.error("[Aether Import] Error:", e.message);
        }
      }
      if (hasError && itemIds.length === 0) {
        new Notice(t("modal.import.failed", { error: errorMsg }), 6000);
        return;
      }
      if (itemIds.length === 0) {
        new Notice(t("modal.import.zero"), 5000);
        return;
      }
      const paths: string[] = [];
      for (const id of itemIds) {
        try {
          const note = await this.plugin.core.approveInboxItem(id);
          paths.push(note.vaultPath);
        } catch (e) {
          console.error("[Aether Import] Auto-approve failed:", e);
        }
      }
      if (paths.length > 0) {
        const folder = paths[0].split("/").slice(0, -1).join("/");
        new Notice(t("modal.import.done", { count: paths.length }) + `\n📁 ${folder}`, 6000);
      } else {
        new Notice(t("modal.import.failed", { error: errorMsg || "approve failed" }), 6000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Aether Import] Exception:", e);
      new Notice(t("modal.import.error", { error: msg }), 6000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
