import { App, Modal, Notice, Setting } from "obsidian";
import type AetherPlugin from "../main.js";
import {
  type AiRole,
  type ProviderConfig,
  type RoleOutputKind,
  findSeed,
} from "@aether/core";
import { t } from "../i18n/index.js";

const OUTPUT_KINDS: RoleOutputKind[] = ["text", "list", "metadata", "embedding"];

/**
 * AI 角色编辑器：编辑现有 Role / 新建自定义 Role。
 *
 * 设计要点：
 *   - 内置角色：name/description/icon 不可改；可改 provider/model/prompt/params/启用
 *   - 自定义角色：全部可改；可删除
 *   - 提示词为空时（embedding outputKind）隐藏提示词区
 *   - 「重置默认」仅对内置角色显示，从 default-roles.ts 拉最新模板回来
 */
export class RoleEditorModal extends Modal {
  private editing: AiRole;
  private modelCache: Map<string, string[]>;

  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
    role: AiRole,
    modelCache: Map<string, string[]>,
    private readonly onSave: (next: AiRole) => Promise<void>,
  ) {
    super(app);
    this.editing = structuredClone(role);
    this.modelCache = modelCache;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("aether-role-editor");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    const r = this.editing;
    const seed = findSeed(r.id);

    root.createEl("h2", {
      text: r.builtIn
        ? t("role.editor.title.builtin", { name: r.name })
        : t("role.editor.title.custom"),
    });

    // ---- 元信息 ----
    new Setting(root)
      .setName(t("role.field.name"))
      .addText((tx) => {
        tx.setValue(r.name).onChange((v) => (r.name = v));
        tx.inputEl.disabled = r.builtIn;
      });
    new Setting(root)
      .setName(t("role.field.icon"))
      .setDesc(t("role.field.icon.desc"))
      .addText((tx) => {
        tx.setValue(r.icon).onChange((v) => (r.icon = v));
        tx.inputEl.disabled = r.builtIn;
      });
    new Setting(root)
      .setName(t("role.field.description"))
      .addText((tx) => {
        tx.setValue(r.description).onChange((v) => (r.description = v));
        tx.inputEl.disabled = r.builtIn;
      });

    // ---- outputKind（仅自定义可改） ----
    new Setting(root)
      .setName(t("role.field.outputKind"))
      .setDesc(t("role.field.outputKind.desc"))
      .addDropdown((d) => {
        for (const k of OUTPUT_KINDS) d.addOption(k, t(`role.outputKind.${k}`));
        d.setValue(r.outputKind);
        d.onChange((v) => {
          r.outputKind = v as RoleOutputKind;
          this.render();
        });
        d.selectEl.disabled = r.builtIn;
      });

    // ---- Provider/Model ----
    const providers = this.plugin.core.settings.current.providers;
    new Setting(root).setName(t("role.field.provider")).addDropdown((d) => {
      d.addOption("", t("common.none"));
      for (const p of providers) d.addOption(p.id, displayProviderName(p));
      d.setValue(r.providerId);
      d.onChange((v) => {
        r.providerId = v;
        r.modelName = "";
        this.render();
      });
    });

    new Setting(root).setName(t("role.field.model")).addDropdown((d) => {
      const cached = this.modelCache.get(r.providerId);
      if (!r.providerId) {
        d.addOption("", t("settings.bindings.model.pickProvider"));
        d.setDisabled(true);
        return;
      }
      if (!cached || cached.length === 0) {
        d.addOption(r.modelName || "", r.modelName || t("settings.bindings.model.noModels"));
        d.setDisabled(true);
        return;
      }
      d.addOption("", t("settings.bindings.model.placeholder"));
      for (const m of cached) d.addOption(m, m);
      d.setValue(r.modelName);
      d.onChange((v) => (r.modelName = v));
    });

    // ---- 提示词模板（embedding 不需要） ----
    if (r.outputKind !== "embedding") {
      const promptSection = root.createDiv();
      promptSection.createEl("h3", { text: t("role.field.prompt") });
      const ta = promptSection.createEl("textarea");
      ta.value = r.promptTemplate;
      ta.addEventListener("input", () => {
        r.promptTemplate = ta.value;
      });
      const varsLine = promptSection.createDiv({ cls: "aether-role-vars" });
      varsLine.createSpan({ text: t("role.field.prompt.vars") + " " });
      for (const v of r.variables.length > 0 ? r.variables : seed?.variables ?? []) {
        const code = varsLine.createEl("code", { text: `{{${v}}}` });
        code.title = t("role.field.prompt.insertVar");
        code.onclick = () => {
          const insertText = `{{${v}}}`;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          ta.value = ta.value.slice(0, start) + insertText + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + insertText.length;
          ta.focus();
          r.promptTemplate = ta.value;
        };
      }
    }

    // ---- 高级参数（折叠） ----
    const adv = root.createEl("details");
    adv.createEl("summary", { text: t("role.field.advanced") });
    new Setting(adv).setName("temperature").addText((tx) => {
      tx.setValue(String(r.params.temperature ?? "")).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n)) r.params.temperature = n;
        else delete r.params.temperature;
      });
    });
    new Setting(adv).setName("maxTokens").addText((tx) => {
      tx.setValue(String(r.params.maxTokens ?? "")).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) r.params.maxTokens = n;
        else delete r.params.maxTokens;
      });
    });

    // ---- 启用 / 编辑器中显示 ----
    new Setting(root).setName(t("role.field.enabled")).addToggle((tg) => {
      tg.setValue(r.enabled).onChange((v) => (r.enabled = v));
    });
    new Setting(root)
      .setName(t("role.field.showInEditor"))
      .setDesc(t("role.field.showInEditor.desc"))
      .addToggle((tg) => {
        tg.setValue(r.showInEditor).onChange((v) => (r.showInEditor = v));
      });

    // ---- 测试运行 ----
    if (r.outputKind !== "embedding") {
      const testBtn = root.createEl("button", { text: t("role.test.button") });
      testBtn.style.marginTop = "0.5rem";
      const resultEl = root.createDiv({ cls: "aether-role-test-result" });
      resultEl.style.display = "none";
      testBtn.onclick = async () => {
        if (!r.providerId || !r.modelName) {
          new Notice(t("role.test.needBinding"), 3000);
          return;
        }
        const sample = await this.getSampleText();
        if (!sample) {
          new Notice(t("role.test.needSelection"), 3000);
          return;
        }
        resultEl.style.display = "block";
        resultEl.setText(t("role.test.running"));
        try {
          // 临时把当前编辑值写回 RoleRegistry 一次（不持久化）
          const live = this.plugin.core.roles.list();
          const next = live.map((x) => (x.id === r.id ? r : x));
          this.plugin.core.roles.setRoles(next);
          const out = await this.plugin.core.runRole(r.id, { selection: sample });
          resultEl.setText(typeof out === "string" ? out : JSON.stringify(out, null, 2));
        } catch (e) {
          resultEl.setText(t("role.test.failed", { error: (e as Error).message }));
        } finally {
          // 恢复原 RoleRegistry（settings 还没保存）
          this.plugin.core.applySettings(this.plugin.core.settings.current);
        }
      };
    }

    // ---- 操作按钮 ----
    const buttons = root.createDiv();
    buttons.style.display = "flex";
    buttons.style.gap = "0.5rem";
    buttons.style.marginTop = "1rem";
    if (r.builtIn) {
      const reset = buttons.createEl("button", { text: t("role.action.reset") });
      reset.onclick = () => {
        if (!seed) return;
        r.promptTemplate = seed.promptTemplate;
        r.variables = [...seed.variables];
        r.params = { ...seed.params };
        r.outputKind = seed.outputKind;
        new Notice(t("role.action.reset.done"), 2000);
        this.render();
      };
    }
    const save = buttons.createEl("button", { text: t("common.save") });
    save.addClass("mod-cta");
    save.onclick = async () => {
      r.updatedAt = Date.now();
      await this.onSave(r);
      this.close();
    };
    const cancel = buttons.createEl("button", { text: t("common.cancel") });
    cancel.onclick = () => this.close();
  }

  /** 从当前编辑器选区拿示例文本；没有选区则用一段固定 sample。 */
  private async getSampleText(): Promise<string> {
    const view = this.app.workspace.activeEditor;
    const sel = view?.editor?.getSelection();
    if (sel && sel.length > 0) return sel;
    return t("role.test.sampleFallback");
  }
}

function displayProviderName(p: ProviderConfig): string {
  return p.name || p.kind || p.id;
}
