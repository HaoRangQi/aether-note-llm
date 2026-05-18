import { App, Modal, Notice } from "obsidian";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";

/**
 * 改 embedding 配置后弹出，询问是否立即重建索引。
 * 不强制——用户也可以稍后手动到「高级 → 重建索引」。
 *
 * 使用场景：
 *   - Settings 角色编辑器保存了 embedding role 且 provider/model 变化时
 *   - 未来其他「索引会失效」的变更也可复用此 Modal
 */
export class RebuildPromptModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
    private readonly args: {
      oldModel?: string;
      newModel: string;
      chunkCount: number;
    },
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("rebuild.title") });
    contentEl.createEl("p", { text: t("rebuild.intro") });

    const box = contentEl.createDiv({ cls: "aether-onboard-card" });
    box.style.marginBottom = "0.75rem";
    box.createDiv({
      text: t("rebuild.diff", {
        old: this.args.oldModel ?? "—",
        next: this.args.newModel,
        count: this.args.chunkCount,
      }),
    });

    contentEl.createEl("p", {
      text: t("rebuild.warn"),
      cls: "setting-item-description",
    });

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.gap = "0.5rem";
    buttons.style.marginTop = "0.75rem";
    buttons.style.justifyContent = "flex-end";

    const later = buttons.createEl("button", { text: t("rebuild.later") });
    later.onclick = () => this.close();

    const now = buttons.createEl("button", { text: t("rebuild.now") });
    now.addClass("mod-cta");
    now.onclick = async () => {
      now.disabled = true;
      later.disabled = true;
      now.setText(t("rebuild.running"));
      try {
        const r = await this.plugin.core.rebuildAll();
        new Notice(
          t("settings.advanced.rebuild.done", { indexed: r.indexed, scanned: r.scanned }),
          5000,
        );
        this.close();
      } catch (e) {
        new Notice(t("rebuild.failed", { error: (e as Error).message }), 6000);
        now.disabled = false;
        later.disabled = false;
        now.setText(t("rebuild.now"));
      }
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
