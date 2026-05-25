import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n/index.js";
import { copyToClipboard } from "../ui/clipboard.js";

export class RewriteResultModal extends Modal {
  constructor(
    app: App,
    private readonly original: string,
    private readonly rewritten: string,
    private readonly onApply: (text: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    // 给 modal 容器加样式类，覆盖 Obsidian 默认
    this.modalEl.addClass("aether-result-modal");

    const el = this.contentEl;
    el.empty();

    // —— 标题行 ——
    const header = el.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "sparkles");
    header.createDiv({ cls: "aether-result-header-title", text: t("modal.aiResult.title") });

    // —— 原文（折叠，默认收起） ——
    const origDetails = el.createEl("details", { cls: "aether-result-section" });
    origDetails.createEl("summary", {
      cls: "aether-result-section-label",
      text: t("modal.aiResult.original"),
    });
    const origPre = origDetails.createEl("pre", {
      cls: "aether-result-pre",
      text: this.original,
    });
    origPre.style.marginTop = "0.4rem";

    // —— AI 输出（展开） ——
    const outSection = el.createDiv({ cls: "aether-result-section" });
    outSection.createDiv({
      cls: "aether-result-section-label",
      text: t("modal.aiResult.rewritten"),
    });
    el.createEl("pre", { cls: "aether-result-pre aether-result-pre--main", text: this.rewritten });

    // —— 操作按钮 ——
    const actions = el.createDiv({ cls: "aether-result-actions" });

    const discardBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("common.discard"),
    });
    discardBtn.onclick = () => this.close();

    const copyBtn = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("modal.aiResult.copy"),
    });
    const copyIcon = copyBtn.createSpan();
    setIcon(copyIcon, "copy");
    copyBtn.onclick = async () => {
      await copyToClipboard(this.rewritten, {
        successMessage: t("modal.aiResult.copied"),
        notify: (message, timeoutMs) => new Notice(message, timeoutMs),
      });
    };

    const applyBtn = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: t("modal.aiResult.replace"),
    });
    const applyIcon = applyBtn.createSpan();
    setIcon(applyIcon, "check");
    applyBtn.onclick = () => {
      this.onApply(this.rewritten);
      this.close();
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
