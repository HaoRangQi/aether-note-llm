import { Notice, type Editor } from "obsidian";
import type AetherPlugin from "./main.js";
import { ImportModal } from "./modals/import-modal.js";
import { RewriteResultModal } from "./modals/rewrite-result-modal.js";
import { DiagnosticsModal } from "./modals/diagnostics-modal.js";
import { SEARCH_VIEW_TYPE } from "./views/search-view.js";
import { INBOX_VIEW_TYPE } from "./views/inbox-view.js";

interface AiAction {
  id: string;
  paletteName: string;
  menuTitle: string;
  icon: string;
  run: (plugin: AetherPlugin, selection: string) => Promise<string>;
}

const AI_ACTIONS: AiAction[] = [
  {
    id: "ai-rewrite",
    paletteName: "AI: Rewrite selection",
    menuTitle: "Aether: AI rewrite",
    icon: "wand",
    run: (plugin, s) => plugin.core.rewrite(s),
  },
  {
    id: "ai-summarize",
    paletteName: "AI: Summarize selection",
    menuTitle: "Aether: AI summarize",
    icon: "file-text",
    run: (plugin, s) => plugin.core.summarize(s),
  },
  {
    id: "ai-extract",
    paletteName: "AI: Extract key points",
    menuTitle: "Aether: Extract key points",
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
    new Notice("Select some text first", 3000);
    return;
  }
  try {
    const out = await action.run(plugin, sel);
    new RewriteResultModal(plugin.app, sel, out, (t) => editor.replaceSelection(t)).open();
  } catch (e) {
    new Notice(`AI failed: ${(e as Error).message}`, 5000);
  }
}

export function registerCommands(plugin: AetherPlugin): void {
  plugin.addCommand({
    id: "open-search",
    name: "Open Search",
    callback: () => plugin.activateView(SEARCH_VIEW_TYPE),
  });

  plugin.addCommand({
    id: "open-inbox",
    name: "Open Inbox",
    callback: () => plugin.activateView(INBOX_VIEW_TYPE),
  });

  plugin.addCommand({
    id: "import",
    name: "Import...",
    callback: () => new ImportModal(plugin.app, plugin).open(),
  });

  plugin.addCommand({
    id: "rebuild-index",
    name: "Rebuild index",
    callback: async () => {
      const r = await plugin.core.rebuildAll();
      new Notice(`Rebuilt: ${r.indexed}/${r.scanned} files`, 6000);
    },
  });

  plugin.addCommand({
    id: "diagnostics",
    name: "Diagnostics export",
    callback: () => new DiagnosticsModal(plugin.app, plugin).open(),
  });

  for (const action of AI_ACTIONS) {
    plugin.addCommand({
      id: action.id,
      name: action.paletteName,
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
            .setTitle(action.menuTitle)
            .setIcon(action.icon)
            .onClick(() => {
              void runAi(plugin, editor, action);
            }),
        );
      }
    }),
  );
}
