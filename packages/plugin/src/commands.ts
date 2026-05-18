import { Notice, type Editor } from "obsidian";
import type AetherPlugin from "./main.js";
import { ImportModal } from "./modals/import-modal.js";
import { RewriteResultModal } from "./modals/rewrite-result-modal.js";
import { DiagnosticsModal } from "./modals/diagnostics-modal.js";
import { HUB_VIEW_TYPE } from "./views/hub-view.js";
import { t } from "./i18n/index.js";
import type { AiRole } from "@aether/core";

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
  try {
    const out = await plugin.core.runRole(role.id, { selection: sel });
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
    id: "rebuild-index",
    name: t("cmd.rebuild"),
    callback: async () => {
      const r = await plugin.core.rebuildAll();
      new Notice(
        t("settings.advanced.rebuild.done", { indexed: r.indexed, scanned: r.scanned }),
        6000,
      );
    },
  });

  plugin.addCommand({
    id: "diagnostics",
    name: t("cmd.diagnostics"),
    callback: () => new DiagnosticsModal(plugin.app, plugin).open(),
  });

  // ---- AI 角色：动态注册 ----
  // 命令面板里每个启用且 showInEditor 的 Role 各占一项；菜单里按需展开。
  const aiRoles = plugin.core.listEditorRoles();
  for (const role of aiRoles) {
    plugin.addCommand({
      id: `ai-role-${role.id}`,
      name: t("cmd.aiRolePrefix") + role.name,
      editorCallback: (editor: Editor) => {
        void runRoleOnSelection(plugin, editor, role);
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
