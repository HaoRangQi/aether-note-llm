import { App, Modal, Notice, Setting } from "obsidian";
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
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("modal.import.title") });

    // —— 模式切换 ——
    const modeBar = this.contentEl.createDiv({ cls: "aether-hub-filterbar" });
    modeBar.style.marginBottom = "0.75rem";
    const mkTab = (m: Mode, label: string): void => {
      const b = modeBar.createEl("button", { text: label });
      if (this.mode === m) b.addClass("active");
      b.onclick = () => {
        this.mode = m;
        this.render();
      };
    };
    mkTab("paste", t("modal.import.tab.paste"));
    mkTab("file", t("modal.import.tab.file"));

    if (this.mode === "paste") {
      this.renderPaste();
    } else {
      this.renderFile();
    }
  }

  // ---- 粘贴文本 ----
  private renderPaste(): void {
    new Setting(this.contentEl).setName(t("modal.import.field")).addTextArea((ta) => {
      ta.inputEl.rows = 12;
      ta.inputEl.cols = 60;
      ta.setValue(this.text);
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
            await this.runImport(source);
          }),
      );
  }

  // ---- 文件导入（iTab / Chrome 书签 JSON）----
  private renderFile(): void {
    this.contentEl.createEl("p", {
      text: t("modal.import.file.desc"),
      cls: "setting-item-description",
    });

    // 文件选择器
    const fileInput = this.contentEl.createEl("input");
    fileInput.type = "file";
    fileInput.accept = ".itabdata,.json";
    fileInput.style.display = "block";
    fileInput.style.marginBottom = "0.75rem";

    let fileContent = "";
    let fileName = "";
    const statusEl = this.contentEl.createDiv({
      cls: "setting-item-description",
      text: t("modal.import.file.noFile"),
    });

    fileInput.onchange = () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      fileName = f.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        fileContent = (e.target?.result as string) ?? "";
        statusEl.setText(t("modal.import.file.ready", { name: fileName }));
      };
      reader.readAsText(f, "utf-8");
    };

    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("common.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modal.import.button"))
          .setCta()
          .onClick(async () => {
            if (!fileContent) {
              new Notice(t("modal.import.file.noFile"), 3000);
              return;
            }
            const source = this.buildFileSource(fileContent, fileName);
            if (!source) {
              new Notice(t("modal.import.file.unknown"), 4000);
              return;
            }
            this.close();
            await this.runImport(source);
          }),
      );
  }

  private buildFileSource(raw: string, fileName: string): ImportSource | null {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".itabdata")) {
      return {
        kind: "file",
        label: fileName,
        payload: { type: "itab-data", raw },
      };
    }
    // JSON 文件：尝试判断是 iTab 还是 Chrome 书签
    if (lower.endsWith(".json")) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (Array.isArray(parsed.navConfig)) {
          // iTab 格式
          return {
            kind: "file",
            label: fileName,
            payload: { type: "itab-data", raw },
          };
        }
        if (parsed.roots) {
          // Chrome 书签格式
          return {
            kind: "file",
            label: fileName,
            payload: { type: "bookmarks-json", raw },
          };
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  // ---- 公共导入逻辑 ----
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
        new Notice(
          t("modal.import.done", { count: paths.length }) + `\n📁 ${folder}`,
          6000,
        );
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
