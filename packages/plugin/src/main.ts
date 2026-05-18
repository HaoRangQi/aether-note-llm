import { Plugin } from "obsidian";
import { AetherCore } from "@aether/core";
import { ObsidianHostAdapter } from "./host-adapter.js";
import { AetherSettingsTab } from "./settings-tab.js";
import { HubView, HUB_VIEW_TYPE } from "./views/hub-view.js";
import { registerCommands } from "./commands.js";
import { setLocale, t } from "./i18n/index.js";

export default class AetherPlugin extends Plugin {
  core!: AetherCore;
  private hubLeafActivating = false;

  async onload(): Promise<void> {
    const adapter = new ObsidianHostAdapter(this.app, this);
    this.core = new AetherCore(adapter);
    await this.core.init();

    setLocale(this.core.settings.current.ui.language);

    this.registerView(HUB_VIEW_TYPE, (leaf) => new HubView(leaf, this));

    this.addSettingTab(new AetherSettingsTab(this.app, this));

    this.addRibbonIcon("layers", t("ribbon.hub"), async () => {
      await this.activateView(HUB_VIEW_TYPE);
    });

    const statusEl = this.addStatusBarItem();
    const updateStatus = (): void => {
      const total = this.core.store.allChunks().length;
      const providers = this.core.settings.current.providers.length;
      statusEl.setText(t("status.bar", { indexed: total, providers }));
    };
    updateStatus();
    this.registerInterval(window.setInterval(updateStatus, 5000) as unknown as number);

    registerCommands(this);

    // 首次安装：自动打开 Hub
    this.app.workspace.onLayoutReady(() => {
      const existing = this.app.workspace.getLeavesOfType(HUB_VIEW_TYPE);
      if (existing.length === 0) void this.activateView(HUB_VIEW_TYPE);
    });
  }

  async onunload(): Promise<void> {
    await this.core.saveIndex();
  }

  async activateView(viewType: string): Promise<void> {
    if (this.hubLeafActivating) return;
    this.hubLeafActivating = true;
    try {
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
    } finally {
      this.hubLeafActivating = false;
    }
  }

  /** 命令调用方使用：打开 Hub 并刷新数据。 */
  async openHubAndRefresh(): Promise<void> {
    await this.activateView(HUB_VIEW_TYPE);
    const leaves = this.app.workspace.getLeavesOfType(HUB_VIEW_TYPE);
    for (const leaf of leaves) {
      const v = leaf.view;
      if (v instanceof HubView) await v.refresh();
    }
  }
}
