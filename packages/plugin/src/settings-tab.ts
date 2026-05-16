import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AetherPlugin from "./main.js";
import type { Feature, FeatureBinding, ProviderConfig } from "@aether/core";
import { newUlid } from "@aether/core";
import { ApiKeyModal } from "./modals/api-key-modal.js";

const FEATURES: Feature[] = [
  "chat",
  "embedding",
  "summarize",
  "rewrite",
  "extract",
  "inbox_metadata",
];

export class AetherSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const root = this.containerEl;
    root.empty();
    root.createEl("h2", { text: "Aether Note LLM" });

    this.renderProviders(root);
    this.renderBindings(root);
    this.renderAdvanced(root);
  }

  private async patch(update: (s: ReturnType<typeof this.snapshot>) => void): Promise<void> {
    const next = this.snapshot();
    update(next);
    await this.plugin.core.settings.save(next);
    this.plugin.core.applySettings(next);
    this.display();
  }

  private snapshot() {
    return structuredClone(this.plugin.core.settings.current);
  }

  private renderProviders(root: HTMLElement): void {
    root.createEl("h3", { text: "Providers" });
    const providers = this.plugin.core.settings.current.providers;
    for (const p of providers) {
      const setting = new Setting(root).setName(p.name).setDesc(`Base URL: ${p.baseUrl}`);
      setting.addText((t) =>
        t
          .setPlaceholder("Display name")
          .setValue(p.name)
          .onChange((v) =>
            this.patch((s) => {
              const found = s.providers.find((x) => x.id === p.id);
              if (found) found.name = v;
            }),
          ),
      );
      setting.addText((t) =>
        t
          .setPlaceholder("https://api...")
          .setValue(p.baseUrl)
          .onChange((v) =>
            this.patch((s) => {
              const found = s.providers.find((x) => x.id === p.id);
              if (found) found.baseUrl = v;
            }),
          ),
      );
      setting.addButton((b) =>
        b.setButtonText("Edit key").onClick(() => {
          const current = this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "";
          new ApiKeyModal(this.app, current, async (next) => {
            await this.patch((s) => {
              s.apiKeys[p.apiKeyRef] = next;
            });
          }).open();
        }),
      );
      setting.addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          try {
            const r = await this.plugin.core.testProvider(p.id);
            if (r.ok) {
              new Notice(`Connected. ${r.models?.length ?? 0} models`, 4000);
            } else {
              new Notice(`Failed: ${r.error ?? "unknown error"}`, 6000);
            }
          } catch (e) {
            new Notice(`Failed: ${(e as Error).message}`, 6000);
          }
        }),
      );
      setting.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(() =>
            this.patch((s) => {
              s.providers = s.providers.filter((x) => x.id !== p.id);
              s.bindings = s.bindings.filter((b2) => b2.providerId !== p.id);
              delete s.apiKeys[p.apiKeyRef];
            }),
          ),
      );
    }
    new Setting(root).addButton((b) =>
      b
        .setButtonText("Add provider")
        .setCta()
        .onClick(() => {
          const id = newUlid();
          const config: ProviderConfig = {
            id,
            name: "New provider",
            baseUrl: "https://api.openai.com/v1",
            apiKeyRef: `key:${id}`,
            defaultHeaders: {},
            enabled: true,
            createdAt: Date.now(),
          };
          this.patch((s) => {
            s.providers.push(config);
          });
        }),
    );
  }

  private renderBindings(root: HTMLElement): void {
    root.createEl("h3", { text: "Feature bindings" });
    const providers = this.plugin.core.settings.current.providers;
    const bindings = this.plugin.core.settings.current.bindings;
    if (providers.length === 0) {
      root.createEl("p", { text: "Add a provider to configure bindings." });
      return;
    }
    for (const f of FEATURES) {
      const existing = bindings.find((b) => b.feature === f);
      new Setting(root)
        .setName(f)
        .addDropdown((d) => {
          d.addOption("", "(none)");
          for (const p of providers) d.addOption(p.id, p.name);
          d.setValue(existing?.providerId ?? "");
          d.onChange((value) =>
            this.patch((s) => {
              s.bindings = s.bindings.filter((b) => b.feature !== f);
              if (value) {
                const binding: FeatureBinding = {
                  feature: f,
                  providerId: value,
                  modelName: existing?.modelName ?? "",
                  params: existing?.params ?? {},
                };
                s.bindings.push(binding);
              }
            }),
          );
        })
        .addText((t) =>
          t
            .setPlaceholder("model name")
            .setValue(existing?.modelName ?? "")
            .onChange((v) =>
              this.patch((s) => {
                const b = s.bindings.find((x) => x.feature === f);
                if (b) b.modelName = v;
              }),
            ),
        );
    }
  }

  private renderAdvanced(root: HTMLElement): void {
    root.createEl("h3", { text: "Advanced" });
    new Setting(root).setName("Aether Inbox folder").addText((t) =>
      t.setValue(this.plugin.core.settings.current.ui.aetherInboxFolder).onChange((v) =>
        this.patch((s) => {
          s.ui.aetherInboxFolder = v;
        }),
      ),
    );
    new Setting(root).setName("Scan scope").addDropdown((d) =>
      d
        .addOption("vault", "Entire vault")
        .addOption("aether-inbox-only", "Aether Inbox only")
        .setValue(this.plugin.core.settings.current.ui.scanScope)
        .onChange((v) =>
          this.patch((s) => {
            s.ui.scanScope = v as typeof s.ui.scanScope;
          }),
        ),
    );
    new Setting(root).setName("Hybrid α (text weight)").addSlider((sl) =>
      sl
        .setLimits(0, 1, 0.05)
        .setDynamicTooltip()
        .setValue(this.plugin.core.settings.current.ui.alpha)
        .onChange((v) =>
          this.patch((s) => {
            s.ui.alpha = v;
          }),
        ),
    );
    new Setting(root)
      .setName("Rebuild index")
      .setDesc("Re-scans the configured scope and rebuilds chunks + vectors.")
      .addButton((b) =>
        b.setButtonText("Rebuild").onClick(async () => {
          const r = await this.plugin.core.rebuildAll();
          new Notice(`Rebuilt: ${r.indexed}/${r.scanned} files`, 6000);
        }),
      );
  }
}
