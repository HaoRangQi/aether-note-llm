import { Plugin } from "obsidian";
import { AetherCore } from "@aether/core";
import { ObsidianHostAdapter } from "./host-adapter.js";
import { AetherSettingsTab } from "./settings-tab.js";
import { SearchView, SEARCH_VIEW_TYPE } from "./views/search-view.js";
import { InboxView, INBOX_VIEW_TYPE } from "./views/inbox-view.js";
import { registerCommands } from "./commands.js";
import { setLocale, t } from "./i18n/index.js";

export default class AetherPlugin extends Plugin {
  core!: AetherCore;

  async onload(): Promise<void> {
    const adapter = new ObsidianHostAdapter(this.app, this);
    this.core = new AetherCore(adapter);
    await this.core.init();

    // 设置加载完后立刻 setLocale，让所有后续 t() 调用拿到正确语言
    setLocale(this.core.settings.current.ui.language);

    this.registerView(SEARCH_VIEW_TYPE, (leaf) => new SearchView(leaf, this));
    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this));

    this.addSettingTab(new AetherSettingsTab(this.app, this));

    this.addRibbonIcon("search", t("ribbon.search"), async () => {
      await this.activateView(SEARCH_VIEW_TYPE);
    });

    const statusEl = this.addStatusBarItem();
    const updateStatus = () => {
      const pending = this.core.inbox.listItems({ status: "pending" }).length;
      statusEl.setText(t("status.inbox", { count: pending }));
    };
    updateStatus();
    this.registerInterval(window.setInterval(updateStatus, 5000) as unknown as number);

    registerCommands(this);
  }

  async onunload(): Promise<void> {
    await this.core.saveIndex();
  }

  async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: viewType, active: true });
    workspace.revealLeaf(leaf);
  }
}
