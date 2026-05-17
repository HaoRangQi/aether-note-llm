import { Notice, type Editor } from "obsidian";
import type AetherPlugin from "./main.js";
import { ImportModal } from "./modals/import-modal.js";
import { RewriteResultModal } from "./modals/rewrite-result-modal.js";
import { DiagnosticsModal } from "./modals/diagnostics-modal.js";
import { SEARCH_VIEW_TYPE } from "./views/search-view.js";
import { INBOX_VIEW_TYPE } from "./views/inbox-view.js";
import { t } from "./i18n/index.js";

interface AiAction {
  id: string;
  paletteKey: string;
  menuKey: string;
  icon: string;
  run: (plugin: AetherPlugin, selection: string) => Promise<string>;
}

const AI_ACTIONS: AiAction[] = [
  {
    id: "ai-rewrite",
    paletteKey: "cmd.aiRewrite",
    menuKey: "menu.aiRewrite",
    icon: "wand",
    run: (plugin, s) => plugin.core.rewrite(s),
  },
  {
    id: "ai-summarize",
    paletteKey: "cmd.aiSummarize",
    menuKey: "menu.aiSummarize",
    icon: "file-text",
    run: (plugin, s) => plugin.core.summarize(s),
  },
  {
    id: "ai-extract",
    paletteKey: "cmd.aiExtract",
    menuKey: "menu.aiExtract",
    icon: "list",
    run: async (plugin, s) => {
      const points = await plugin.core.extract(s);
      return points.map((p) => `- ${p}`).join("\n");
    },
  },
];

async function runAi(plugin: AetherPlugin, editor: Editor, action: AiAction): Promise<void> {
  const sel = editor.getSelection();
  if (!sel) {
    new Notice(t("ai.selectFirst"), 3000);
    return;
  }
  try {
    const out = await action.run(plugin, sel);
    new RewriteResultModal(plugin.app, sel, out, (text) => editor.replaceSelection(text)).open();
  } catch (e) {
    new Notice(t("ai.failed", { error: (e as Error).message }), 5000);
  }
}

export function registerCommands(plugin: AetherPlugin): void {
  plugin.addCommand({
    id: "open-search",
    name: t("cmd.openSearch"),
    callback: () => plugin.activateView(SEARCH_VIEW_TYPE),
  });

  plugin.addCommand({
    id: "open-inbox",
    name: t("cmd.openInbox"),
    callback: () => plugin.activateView(INBOX_VIEW_TYPE),
  });

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

  plugin.addCommand({
    id: "show-inbox-location",
    name: t("cmd.showInboxLocation"),
    callback: async () => {
      const folder = plugin.core.settings.current.ui.aetherInboxFolder;
      const pending = plugin.core.inbox.listItems({ status: "pending" });
      const approved = plugin.core.inbox.listItems({ status: "approved" });
      
      let msg = `📁 Inbox 文件夹: ${folder}\n\n`;
      msg += `⏳ 待审核: ${pending.length} 项\n`;
      msg += `✅ 已批准: ${approved.length} 项\n\n`;
      msg += `💡 导入流程:\n`;
      msg += `1. 导入后项目进入 Inbox (待审核)\n`;
      msg += `2. 在 Inbox 视图中批准项目\n`;
      msg += `3. 批准后项目保存到: ${folder}/notes/{year}/{month}/\n`;
      msg += `4. 点击设置中的文件夹按钮打开 Inbox 文件夹`;
      
      new Notice(msg, 8000);
    },
  });

  for (const action of AI_ACTIONS) {
    plugin.addCommand({
      id: action.id,
      name: t(action.paletteKey),
      editorCallback: (editor: Editor) => {
        void runAi(plugin, editor, action);
      },
    });
  }

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      if (!editor.getSelection()) return;
      for (const action of AI_ACTIONS) {
        menu.addItem((i) =>
          i
            .setTitle(t(action.menuKey))
            .setIcon(action.icon)
            .onClick(() => {
              void runAi(plugin, editor, action);
            }),
        );
      }
    }),
  );
}
