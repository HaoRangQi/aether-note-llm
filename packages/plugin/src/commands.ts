import { Notice, SuggestModal, setIcon, type App, type Editor } from "obsidian";
import type AetherPlugin from "./main.js";
import { ImportModal, openPendingImportItems } from "./modals/import-modal.js";
import { RewriteResultModal } from "./modals/rewrite-result-modal.js";
import { DiagnosticsModal } from "./modals/diagnostics-modal.js";
import { JobHistoryModal } from "./modals/job-history-modal.js";
import { OrganizeImportsModal } from "./modals/organize-imports-modal.js";
import { UsageModal } from "./modals/usage-modal.js";
import { HUB_VIEW_TYPE } from "./views/hub-view.js";
import { AiActivityIndicator } from "./ui/ai-activity.js";
import { runRebuildJob, runRefreshIndexJob } from "./ui/job-tracker.js";
import { t } from "./i18n/index.js";
import type { AiRole } from "@aether/core";

class RoleSuggestModal extends SuggestModal<AiRole> {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
    private readonly editor: Editor,
  ) {
    super(app);
    this.setPlaceholder(t("modal.roleSuggest.placeholder"));
    this.emptyStateText = t("modal.roleSuggest.empty");
  }

  getSuggestions(query: string): AiRole[] {
    const q = query.trim().toLowerCase();
    const roles = this.plugin.core.listEditorRoles();
    if (!q) return roles;
    return roles.filter((role) => `${role.name} ${role.description}`.toLowerCase().includes(q));
  }

  renderSuggestion(role: AiRole, el: HTMLElement): void {
    const row = el.createDiv({ cls: "aether-role-suggestion" });
    const icon = row.createSpan({ cls: "aether-role-suggestion-icon" });
    setIcon(icon, role.icon || "sparkles");
    const main = row.createDiv({ cls: "aether-role-suggestion-main" });
    main.createDiv({ cls: "aether-role-suggestion-name", text: role.name });
    if (role.description) {
      main.createDiv({ cls: "aether-role-suggestion-desc", text: role.description });
    }
  }

  onChooseSuggestion(role: AiRole): void {
    const live = this.plugin.core.listEditorRoles().find((r) => r.id === role.id);
    if (!live) {
      new Notice(t("ai.roleUnavailable"), 4000);
      return;
    }
    void runRoleOnSelection(this.plugin, this.editor, live);
  }
}

/**
 * 编辑器选区上跑某个 AI 角色，结果展示给用户决定是否采纳。
 */
async function runRoleOnSelection(
  plugin: AetherPlugin,
  editor: Editor,
  role: AiRole,
): Promise<void> {
  const sel = editor.getSelection();
  if (!sel) {
    new Notice(t("ai.selectFirst"), 3000);
    return;
  }
  // 拼装服务商/模型副标题
  const provider = plugin.core.settings.current.providers.find((p) => p.id === role.providerId);
  const providerLabel = provider?.name || provider?.kind || provider?.id || "—";
  const meta = `${providerLabel} · ${role.modelName || "—"}`;

  // AbortController 让用户能真正取消
  const ac = new AbortController();
  const indicator = new AiActivityIndicator({
    roleName: role.name,
    roleIcon: role.icon,
    meta,
    onCancel: () => ac.abort(),
  });

  try {
    const sourcePath = plugin.app.workspace.getActiveFile?.()?.path;
    const out = await plugin.core.runRole(role.id, { selection: sel }, ac.signal, sourcePath);
    if (ac.signal.aborted) {
      indicator.hide("cancelled");
      new Notice(t("ai.cancelled"), 3000);
      return;
    }
    indicator.hide("done");
    let text: string;
    if (Array.isArray(out)) {
      text = (out as string[]).map((p) => `- ${p}`).join("\n");
    } else if (typeof out === "string") {
      text = out;
    } else {
      text = JSON.stringify(out, null, 2);
    }
    new RewriteResultModal(plugin.app, sel, text, (replacement) =>
      editor.replaceSelection(replacement),
    ).open();
  } catch (e) {
    if (ac.signal.aborted) {
      indicator.hide("cancelled");
      new Notice(t("ai.cancelled"), 3000);
      return;
    }
    indicator.hide("error");
    new Notice(t("ai.failed", { error: (e as Error).message }), 5000);
  }
}

export function registerCommands(plugin: AetherPlugin): void {
  // ---- 视图 ----
  plugin.addCommand({
    id: "open-hub",
    name: t("cmd.openHub"),
    callback: () => plugin.activateView(HUB_VIEW_TYPE),
  });
  // 兼容旧命令 ID（避免用户绑过的快捷键失效）
  plugin.addCommand({
    id: "open-search",
    name: t("cmd.openHub"),
    callback: () => plugin.activateView(HUB_VIEW_TYPE),
  });
  plugin.addCommand({
    id: "open-inbox",
    name: t("cmd.openHub"),
    callback: () => plugin.activateView(HUB_VIEW_TYPE),
  });

  // ---- 操作 ----
  plugin.addCommand({
    id: "import",
    name: t("cmd.import"),
    callback: () => new ImportModal(plugin.app, plugin).open(),
  });

  plugin.addCommand({
    id: "pending-imports",
    name: t("cmd.pendingImports"),
    callback: () => {
      openPendingImportItems(plugin.app, plugin);
    },
  });

  plugin.addCommand({
    id: "organize-imports",
    name: t("cmd.organizeImports"),
    callback: () => new OrganizeImportsModal(plugin.app, plugin).open(),
  });

  plugin.addCommand({
    id: "rebuild-index",
    name: t("cmd.rebuild"),
    callback: () => void runRebuildJob(plugin),
  });

  plugin.addCommand({
    id: "refresh-index-changes",
    name: t("cmd.refreshIndex"),
    callback: () => void runRefreshIndexJob(plugin),
  });

  plugin.addCommand({
    id: "diagnostics",
    name: t("cmd.diagnostics"),
    callback: () => new DiagnosticsModal(plugin.app, plugin).open(),
  });
  plugin.addCommand({
    id: "job-history",
    name: t("cmd.jobHistory"),
    callback: () => new JobHistoryModal(plugin.app, plugin).open(),
  });
  plugin.addCommand({
    id: "usage",
    name: t("cmd.usage"),
    callback: () => new UsageModal(plugin.app, plugin).open(),
  });

  plugin.addCommand({
    id: "run-ai-role",
    name: t("cmd.runAiRole"),
    editorCallback: (editor: Editor) => {
      if (!editor.getSelection()) {
        new Notice(t("ai.selectFirst"), 3000);
        return;
      }
      new RoleSuggestModal(plugin.app, plugin, editor).open();
    },
  });

  // ---- AI 角色：动态注册 ----
  // 命令面板里每个启用且 showInEditor 的 Role 各占一项；菜单里按需展开。
  const aiRoles = plugin.core.listEditorRoles();
  for (const role of aiRoles) {
    plugin.addCommand({
      id: `ai-role-${role.id}`,
      name: t("cmd.aiRolePrefix") + role.name,
      editorCallback: (editor: Editor) => {
        const live = plugin.core.listEditorRoles().find((r) => r.id === role.id);
        if (!live) {
          new Notice(t("ai.roleUnavailable"), 4000);
          return;
        }
        void runRoleOnSelection(plugin, editor, live);
      },
    });
  }

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      if (!editor.getSelection()) return;
      // 实时读最新 roles —— 用户改完 settings 不需要重启即可在菜单里看到
      const roles = plugin.core.listEditorRoles();
      for (const role of roles) {
        menu.addItem((i) =>
          i
            .setTitle(t("menu.aiRolePrefix") + role.name)
            .setIcon(role.icon)
            .onClick(() => {
              void runRoleOnSelection(plugin, editor, role);
            }),
        );
      }
    }),
  );
}
