import { setIcon } from "obsidian";
import { t } from "../i18n/index.js";

export interface AiActivityOptions {
  roleName: string;
  roleIcon: string;
  /** 显示在副标题的服务商/模型信息，例如 "DeepSeek · deepseek-chat" */
  meta?: string;
  /** 用户点取消时调用 */
  onCancel?: () => void;
}

/**
 * 浮动 AI 活动指示器：屏幕顶部居中弹出，带玻璃拟态、渐变流光、脉冲图标、
 * 流光进度条、取消按钮。完成时滑出动画再移除。
 *
 * 一次只允许一个实例（如果新请求来了，旧的会被强制收掉）。
 */
let active: AiActivityIndicator | null = null;

export class AiActivityIndicator {
  private el: HTMLDivElement;
  private startedAt: number;
  private removed = false;
  private timeEl: HTMLSpanElement;
  private timer: number | undefined;
  private readonly onCancel?: () => void;
  private cancelled = false;

  constructor(opts: AiActivityOptions) {
    if (active) active.cancelAndHide();
    active = this;
    this.onCancel = opts.onCancel;
    this.startedAt = Date.now();

    this.el = document.body.createDiv({ cls: "aether-ai-activity" });
    const header = this.el.createDiv({ cls: "aether-ai-activity-header" });

    // 脉动图标
    const iconEl = header.createDiv({ cls: "aether-ai-activity-icon" });
    setIcon(iconEl, opts.roleIcon || "sparkles");

    // 流光文字（Role 名）
    const nameWrap = header.createDiv({ cls: "aether-ai-activity-namewrap" });
    nameWrap.createDiv({
      cls: "aether-ai-activity-name",
      text: t("ai.activity.running", { name: opts.roleName }),
    });
    const metaEl = nameWrap.createDiv({ cls: "aether-ai-activity-meta" });
    if (opts.meta) metaEl.createSpan({ text: opts.meta + " · " });
    this.timeEl = metaEl.createSpan({ text: "0s" });

    // 取消按钮
    if (opts.onCancel) {
      const cancel = header.createEl("button", {
        cls: "aether-ai-activity-cancel",
        text: t("ai.activity.cancel"),
      });
      cancel.onclick = () => {
        this.cancelAndHide();
      };
    }

    // 流光进度条
    this.el.createDiv({ cls: "aether-ai-activity-bar" });

    // 计时器
    this.timer = window.setInterval(() => {
      const sec = Math.floor((Date.now() - this.startedAt) / 1000);
      this.timeEl.setText(`${sec}s`);
    }, 500) as unknown as number;
  }

  /** 实时更新副标题（用于导入进度等场景）。 */
  updateMeta(text: string): void {
    if (this.removed) return;
    // metaEl 是 namewrap 里的第二个子元素
    const metaEl = this.el.querySelector(".aether-ai-activity-meta");
    if (metaEl) {
      // 保留计时 span，只更新前缀文字
      const timeSpan = metaEl.querySelector("span:last-child");
      metaEl.empty();
      metaEl.createSpan({ text: text + " · " });
      if (timeSpan) metaEl.appendChild(timeSpan);
    }
  }

  hide(state: "done" | "error" | "cancelled" = "done"): void {
    if (this.removed) return;
    this.removed = true;
    if (active === this) active = null;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.el.addClass(`is-${state}`);
    // 等动画结束再移除
    window.setTimeout(() => this.el.remove(), 350);
  }

  private cancelAndHide(): void {
    if (!this.cancelled) {
      this.cancelled = true;
      this.onCancel?.();
    }
    this.hide("cancelled");
  }
}
