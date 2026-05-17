import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AetherPlugin from "./main.js";
import {
  PROVIDER_PRESETS,
  findPresetById,
  newUlid,
  type Feature,
  type FeatureBinding,
  type ProviderConfig,
} from "@aether/core";
import { ApiKeyModal } from "./modals/api-key-modal.js";
import { setLocale, t } from "./i18n/index.js";

const FEATURES: Feature[] = [
  "embedding",
  "inbox_metadata",
  "summarize",
  "rewrite",
  "extract",
  "chat",
];

/**
 * 模型列表的内存缓存：key = providerId，value = 测试连接成功后拿到的模型 id 列表。
 * 不持久化 —— 每次插件加载后重新查询，避免模型新增/下线时缓存陈旧。
 */
type ModelCache = Map<string, string[]>;

export class AetherSettingsTab extends PluginSettingTab {
  private modelCache: ModelCache = new Map();
  private testingProviders = new Set<string>();

  constructor(
    app: App,
    private readonly plugin: AetherPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const root = this.containerEl;
    root.empty();
    root.createEl("h2", { text: t("settings.title") });

    this.renderGeneral(root);
    this.renderProviders(root);
    this.renderBindings(root);
    this.renderAdvanced(root);
  }

  private async patch(update: (s: ReturnType<typeof this.snapshot>) => void): Promise<void> {
    const next = this.snapshot();
    update(next);
    await this.plugin.core.settings.save(next);
    this.plugin.core.applySettings(next);
    setLocale(next.ui.language);
    this.display();
  }

  private snapshot() {
    return structuredClone(this.plugin.core.settings.current);
  }

  // ---- 通用区（含语言切换）----------------------------------------------
  private renderGeneral(root: HTMLElement): void {
    root.createEl("h3", { text: t("settings.section.general") });
    new Setting(root)
      .setName(t("settings.language"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) => {
        d.addOption("zh-CN", t("settings.language.zh"));
        d.addOption("en", t("settings.language.en"));
        d.setValue(this.plugin.core.settings.current.ui.language);
        d.onChange((v) =>
          this.patch((s) => {
            s.ui.language = v as typeof s.ui.language;
          }),
        );
      });
  }

  // ---- 服务商区 ---------------------------------------------------------
  private renderProviders(root: HTMLElement): void {
    root.createEl("h3", { text: t("settings.section.providers") });
    const providers = this.plugin.core.settings.current.providers;

    if (providers.length === 0) {
      root.createEl("p", { text: t("settings.providers.empty"), cls: "setting-item-description" });
    }

    for (const p of providers) {
      this.renderProviderCard(root, p);
    }

    new Setting(root).addButton((b) =>
      b
        .setButtonText(t("settings.providers.add"))
        .setCta()
        .onClick(() => {
          const id = newUlid();
          const config: ProviderConfig = {
            id,
            name: "",
            baseUrl: "",
            apiKeyRef: `key:${id}`,
            defaultHeaders: {},
            enabled: true,
            createdAt: Date.now(),
            kind: "",
          };
          this.patch((s) => {
            s.providers.push(config);
          });
        }),
    );
  }

  private renderProviderCard(root: HTMLElement, p: ProviderConfig): void {
    const card = root.createDiv({ cls: "aether-provider-card" });
    const preset = p.kind ? findPresetById(p.kind) : undefined;
    const apiKeySet =
      (this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "").length > 0;

    // —— 行 1：预设选择（决定 baseUrl 和显示名）——
    new Setting(card)
      .setName(t("settings.providers.preset"))
      .addDropdown((d) => {
        d.addOption("", t("settings.providers.preset.placeholder"));
        for (const ps of PROVIDER_PRESETS) d.addOption(ps.id, ps.displayName);
        d.setValue(p.kind ?? "");
        d.onChange((value) =>
          this.patch((s) => {
            const found = s.providers.find((x) => x.id === p.id);
            if (!found) return;
            found.kind = value;
            const ps = findPresetById(value);
            if (ps) {
              found.name = ps.displayName;
              if (ps.id !== "custom") {
                found.baseUrl = ps.baseUrl;
              }
            }
          }),
        );
      })
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip(t("common.remove"))
          .onClick(() =>
            this.patch((s) => {
              s.providers = s.providers.filter((x) => x.id !== p.id);
              s.bindings = s.bindings.filter((b2) => b2.providerId !== p.id);
              delete s.apiKeys[p.apiKeyRef];
            }),
          ),
      );

    // —— 行 2：Base URL（custom 才能编辑）——
    const baseUrlSetting = new Setting(card).setName(t("settings.providers.baseUrl"));
    if (preset && preset.id !== "custom") {
      baseUrlSetting.setDesc(t("settings.providers.baseUrl.preset", { url: p.baseUrl }));
    } else {
      baseUrlSetting.setDesc(t("settings.providers.baseUrl.custom")).addText((txt) =>
        txt
          .setPlaceholder("https://api.example.com/v1")
          .setValue(p.baseUrl)
          .onChange((v) =>
            this.patch((s) => {
              const found = s.providers.find((x) => x.id === p.id);
              if (found) found.baseUrl = v;
            }),
          ),
      );
    }

    // —— 行 3：API Key + 申请链接 ——
    const keySetting = new Setting(card).setName(t("settings.providers.apiKey"));
    keySetting.setDesc(
      apiKeySet ? t("settings.providers.apiKey.set") : t("settings.providers.apiKey.unset"),
    );
    keySetting.addButton((b) =>
      b.setButtonText(t("settings.providers.editKey")).onClick(() => {
        const current = this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "";
        new ApiKeyModal(this.app, current, async (next) => {
          await this.patch((s) => {
            s.apiKeys[p.apiKeyRef] = next;
          });
        }).open();
      }),
    );
    if (preset?.signupUrl) {
      const signupUrl = preset.signupUrl;
      keySetting.addExtraButton((b) =>
        b
          .setIcon("external-link")
          .setTooltip(t("settings.providers.signup"))
          .onClick(() => window.open(signupUrl, "_blank")),
      );
    }

    // —— 行 4：测试连接 + 模型缓存状态 ——
    const cached = this.modelCache.get(p.id);
    const isTesting = this.testingProviders.has(p.id);
    const testSetting = new Setting(card).setName(t("settings.providers.test"));
    if (isTesting) {
      testSetting.setDesc(t("settings.providers.testing"));
    } else if (cached) {
      testSetting.setDesc(t("settings.providers.modelsCached", { count: cached.length }));
    } else {
      testSetting.setDesc(t("settings.providers.modelsNotCached"));
    }
    testSetting.addButton((b) =>
      b
        .setButtonText(cached ? t("settings.providers.refreshModels") : t("settings.providers.test"))
        .onClick(() => this.runTest(p.id)),
    );
  }

  private async runTest(providerId: string): Promise<void> {
    if (this.testingProviders.has(providerId)) return;
    this.testingProviders.add(providerId);
    this.display();
    try {
      const r = await this.plugin.core.testProvider(providerId);
      if (r.ok) {
        const models = r.models ?? [];
        // 拿不到模型列表时（某些服务商不返回 embedding 模型），用预设的 fallback
        const config = this.plugin.core.settings.current.providers.find((x) => x.id === providerId);
        const preset = config?.kind ? findPresetById(config.kind) : undefined;
        const merged = mergeModels(models, preset?.fallbackModels);
        this.modelCache.set(providerId, merged);
        new Notice(t("settings.providers.test.ok", { count: merged.length }), 4000);
      } else {
        new Notice(
          t("settings.providers.test.fail", {
            error: r.error ?? t("settings.providers.test.unknown"),
          }),
          6000,
        );
      }
    } catch (e) {
      new Notice(
        t("settings.providers.test.fail", { error: (e as Error).message }),
        6000,
      );
    } finally {
      this.testingProviders.delete(providerId);
      this.display();
    }
  }

  // ---- 功能绑定区 -------------------------------------------------------
  private renderBindings(root: HTMLElement): void {
    root.createEl("h3", { text: t("settings.section.bindings") });
    const providers = this.plugin.core.settings.current.providers;
    const bindings = this.plugin.core.settings.current.bindings;

    if (providers.length === 0) {
      root.createEl("p", {
        text: t("settings.bindings.empty"),
        cls: "setting-item-description",
      });
      return;
    }

    root.createEl("p", {
      text: t("settings.bindings.intro"),
      cls: "setting-item-description",
    });

    new Setting(root).addButton((b) =>
      b
        .setButtonText(t("settings.bindings.applyRecommended"))
        .onClick(() => this.applyRecommended()),
    );

    for (const f of FEATURES) {
      this.renderBindingRow(root, f, bindings);
    }
  }

  private renderBindingRow(
    root: HTMLElement,
    feature: Feature,
    bindings: FeatureBinding[],
  ): void {
    const providers = this.plugin.core.settings.current.providers;
    const existing = bindings.find((b) => b.feature === feature);
    const cachedModels = existing ? this.modelCache.get(existing.providerId) : undefined;

    const setting = new Setting(root)
      .setName(t(`feature.${feature}`))
      .setDesc(t(`feature.${feature}.desc`));

    // Provider 下拉
    setting.addDropdown((d) => {
      d.addOption("", t("common.none"));
      for (const p of providers) d.addOption(p.id, p.name || p.kind || p.id);
      d.setValue(existing?.providerId ?? "");
      d.onChange((value) =>
        this.patch((s) => {
          s.bindings = s.bindings.filter((b) => b.feature !== feature);
          if (value) {
            const binding: FeatureBinding = {
              feature,
              providerId: value,
              modelName: existing?.modelName ?? "",
              params: existing?.params ?? {},
            };
            s.bindings.push(binding);
          }
        }),
      );
    });

    // Model 下拉（无 provider 或无缓存时给文字提示）
    setting.addDropdown((d) => {
      if (!existing?.providerId) {
        d.addOption("", t("settings.bindings.model.pickProvider"));
        d.setDisabled(true);
        return;
      }
      if (!cachedModels || cachedModels.length === 0) {
        d.addOption("", t("settings.bindings.model.noModels"));
        d.setDisabled(true);
        return;
      }
      d.addOption("", t("settings.bindings.model.placeholder"));
      for (const m of cachedModels) d.addOption(m, m);
      d.setValue(existing.modelName);
      d.onChange((value) =>
        this.patch((s) => {
          const b = s.bindings.find((x) => x.feature === feature);
          if (b) b.modelName = value;
        }),
      );
    });
  }

  private async applyRecommended(): Promise<void> {
    const providers = this.plugin.core.settings.current.providers;
    if (providers.length === 0) return;

    // 找推荐用于 embedding / chat 的服务商
    const embedProvider = providers.find((p) => {
      const ps = p.kind ? findPresetById(p.kind) : undefined;
      return ps?.recommendedFor.embedding;
    });
    const chatProvider = providers.find((p) => {
      const ps = p.kind ? findPresetById(p.kind) : undefined;
      return ps?.recommendedFor.chat;
    });

    if (!embedProvider && !chatProvider) {
      new Notice(t("settings.bindings.empty"), 4000);
      return;
    }

    await this.patch((s) => {
      const upsert = (feature: Feature, providerId: string, model: string) => {
        const existing = s.bindings.find((b) => b.feature === feature);
        if (existing) {
          existing.providerId = providerId;
          if (!existing.modelName) existing.modelName = model;
        } else {
          s.bindings.push({ feature, providerId, modelName: model, params: {} });
        }
      };
      if (embedProvider) {
        const ps = embedProvider.kind ? findPresetById(embedProvider.kind) : undefined;
        const model = this.modelCache.get(embedProvider.id)?.[0] ?? ps?.fallbackModels?.[0] ?? "";
        upsert("embedding", embedProvider.id, model);
      }
      if (chatProvider) {
        const ps = chatProvider.kind ? findPresetById(chatProvider.kind) : undefined;
        const model = this.modelCache.get(chatProvider.id)?.[0] ?? ps?.fallbackModels?.[0] ?? "";
        upsert("chat", chatProvider.id, model);
        upsert("inbox_metadata", chatProvider.id, model);
        upsert("summarize", chatProvider.id, model);
        upsert("rewrite", chatProvider.id, model);
        upsert("extract", chatProvider.id, model);
      }
    });
    new Notice(t("settings.bindings.applied"), 3000);
  }

  // ---- 高级 -------------------------------------------------------------
  private renderAdvanced(root: HTMLElement): void {
    root.createEl("h3", { text: t("settings.section.advanced") });

    new Setting(root)
      .setName(t("settings.advanced.inboxFolder"))
      .setDesc(t("settings.advanced.inboxFolder.desc"))
      .addText((txt) =>
        txt.setValue(this.plugin.core.settings.current.ui.aetherInboxFolder).onChange((v) =>
          this.patch((s) => {
            s.ui.aetherInboxFolder = v;
          }),
        ),
      );

    new Setting(root).setName(t("settings.advanced.scope")).addDropdown((d) =>
      d
        .addOption("vault", t("settings.advanced.scope.vault"))
        .addOption("aether-inbox-only", t("settings.advanced.scope.inbox"))
        .setValue(this.plugin.core.settings.current.ui.scanScope)
        .onChange((v) =>
          this.patch((s) => {
            s.ui.scanScope = v as typeof s.ui.scanScope;
          }),
        ),
    );

    new Setting(root)
      .setName(t("settings.advanced.alpha"))
      .setDesc(t("settings.advanced.alpha.desc"))
      .addSlider((sl) =>
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
      .setName(t("settings.advanced.rebuild"))
      .setDesc(t("settings.advanced.rebuild.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.advanced.rebuild.button")).onClick(async () => {
          const r = await this.plugin.core.rebuildAll();
          new Notice(
            t("settings.advanced.rebuild.done", { indexed: r.indexed, scanned: r.scanned }),
            6000,
          );
        }),
      );
  }
}

/** 合并 listModels 的结果与预设 fallbackModels，去重，预设兜底排后面。 */
function mergeModels(live: string[], fallback: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of live) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  for (const m of fallback ?? []) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}
