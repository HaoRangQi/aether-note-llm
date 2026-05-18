import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AetherPlugin from "./main.js";
import {
  PROVIDER_PRESETS,
  findPresetById,
  newUlid,
  type AiRole,
  type ProviderConfig,
} from "@aether/core";
import { ApiKeyModal } from "./modals/api-key-modal.js";
import { RoleEditorModal } from "./modals/role-editor.js";
import { setLocale, t } from "./i18n/index.js";

type Section = "quickstart" | "providers" | "roles" | "advanced";

/**
 * 4 段式 Settings：
 *   - Quick Start: 一屏配完（首次安装到达）
 *   - Providers: AI 服务商管理
 *   - AI Roles: 角色管理 + 提示词编辑
 *   - Advanced: 文件夹、扫描范围、混合搜索 alpha、重建索引
 *
 * 性能：每个 section 自渲染，只重绘当前 section（patch 后），减少抖动。
 */
export class AetherSettingsTab extends PluginSettingTab {
  private modelCache = new Map<string, string[]>();
  private testingProviders = new Set<string>();
  private currentSection: Section = "quickstart";

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

    // 顶部 section 选择器
    this.renderTabs(root);

    const body = root.createDiv();
    this.renderSection(body);
  }

  // ---- Section 切换 -----------------------------------------------------
  private renderTabs(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "aether-hub-filterbar" });
    bar.style.marginBottom = "0.75rem";
    const mk = (id: Section, label: string): HTMLButtonElement => {
      const b = bar.createEl("button", { text: label });
      if (this.currentSection === id) b.addClass("active");
      b.onclick = () => {
        this.currentSection = id;
        this.display();
      };
      return b;
    };
    mk("quickstart", t("settings.section.quickStart"));
    mk("providers", t("settings.section.providers"));
    mk("roles", t("settings.section.roles"));
    mk("advanced", t("settings.section.advanced"));
  }

  private renderSection(body: HTMLElement): void {
    body.empty();
    switch (this.currentSection) {
      case "quickstart":
        this.renderQuickStart(body);
        break;
      case "providers":
        this.renderProviders(body);
        break;
      case "roles":
        this.renderRoles(body);
        break;
      case "advanced":
        this.renderAdvanced(body);
        break;
    }
  }

  private async patch(
    update: (s: ReturnType<typeof this.snapshot>) => void,
  ): Promise<void> {
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

  // ---- Quick Start ------------------------------------------------------
  private renderQuickStart(root: HTMLElement): void {
    root.createEl("p", {
      text: t("settings.quickStart.intro"),
      cls: "setting-item-description",
    });

    // 语言（简单优先，不放在 advanced 里）
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

    const providers = this.plugin.core.settings.current.providers;

    // 状态摘要
    const statusBox = root.createDiv({ cls: "aether-onboard-card" });
    statusBox.createDiv({
      cls: "aether-onboard-title",
      text: t("settings.quickStart.statusTitle"),
    });
    const ok = providers.length > 0;
    const desc = statusBox.createDiv({ cls: "aether-onboard-desc" });
    desc.setText(
      ok
        ? t("settings.quickStart.statusOk", { count: providers.length })
        : t("settings.quickStart.statusEmpty"),
    );

    // 添加预设的快捷入口
    const quickRow = root.createDiv();
    quickRow.style.display = "flex";
    quickRow.style.gap = "0.5rem";
    quickRow.style.marginBottom = "1rem";
    for (const ps of PROVIDER_PRESETS) {
      if (ps.id === "custom") continue;
      const btn = quickRow.createEl("button", {
        text: t("settings.quickStart.addPreset", { name: ps.displayName }),
      });
      btn.onclick = () => this.addProviderFromPreset(ps.id);
    }

    if (providers.length > 0) {
      // 应用推荐配置（一键把所有 Roles 绑到第一个能用的 provider）
      new Setting(root)
        .setName(t("settings.quickStart.applyRecommended"))
        .setDesc(t("settings.quickStart.applyRecommended.desc"))
        .addButton((b) => {
          b.setButtonText(t("settings.bindings.applyRecommended"))
            .setCta()
            .onClick(() => this.applyRecommended());
        });
    }
  }

  private async addProviderFromPreset(presetId: string): Promise<void> {
    const ps = findPresetById(presetId);
    if (!ps) return;
    const id = newUlid();
    const config: ProviderConfig = {
      id,
      name: ps.displayName,
      baseUrl: ps.baseUrl,
      apiKeyRef: `key:${id}`,
      defaultHeaders: {},
      enabled: true,
      createdAt: Date.now(),
      kind: ps.id,
    };
    await this.patch((s) => {
      s.providers.push(config);
    });
    this.currentSection = "providers";
    this.display();
    new Notice(t("settings.quickStart.providerAdded", { name: ps.displayName }), 4000);
  }

  // ---- Providers --------------------------------------------------------
  private renderProviders(root: HTMLElement): void {
    const providers = this.plugin.core.settings.current.providers;
    if (providers.length === 0) {
      root.createEl("p", {
        text: t("settings.providers.empty"),
        cls: "setting-item-description",
      });
    }
    for (const p of providers) this.renderProviderCard(root, p);

    new Setting(root).addButton((b) =>
      b
        .setButtonText(t("settings.providers.add"))
        .setCta()
        .onClick(() => {
          const id = newUlid();
          this.patch((s) => {
            s.providers.push({
              id,
              name: "",
              baseUrl: "",
              apiKeyRef: `key:${id}`,
              defaultHeaders: {},
              enabled: true,
              createdAt: Date.now(),
              kind: "",
            });
          });
        }),
    );
  }

  private renderProviderCard(root: HTMLElement, p: ProviderConfig): void {
    const card = root.createDiv({ cls: "aether-provider-card" });
    const preset = p.kind ? findPresetById(p.kind) : undefined;
    const apiKeySet = (this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "").length > 0;

    // —— 行 0：名称（用户自己取的别名，多实例时区分用）——
    new Setting(card)
      .setName(t("settings.providers.name"))
      .setDesc(t("settings.providers.name.desc"))
      .addText((tx) =>
        tx
          .setPlaceholder(preset?.displayName ?? t("settings.providers.name.placeholder"))
          .setValue(p.name)
          .onChange((v) =>
            this.patch((s) => {
              const found = s.providers.find((x) => x.id === p.id);
              if (found) found.name = v;
            }),
          ),
      );

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
              // 仅当用户没自定义名称时，才用预设名作为默认值
              if (!found.name || found.name === preset?.displayName) {
                found.name = ps.displayName;
              }
              if (ps.id !== "custom") found.baseUrl = ps.baseUrl;
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
              // 把任何引用此 provider 的 role 解绑
              for (const r of s.roles) {
                if (r.providerId === p.id) {
                  r.providerId = "";
                  r.modelName = "";
                }
              }
              delete s.apiKeys[p.apiKeyRef];
            }),
          ),
      );

    const baseUrlSetting = new Setting(card).setName(t("settings.providers.baseUrl"));
    if (preset && preset.id !== "custom") {
      baseUrlSetting.setDesc(t("settings.providers.baseUrl.preset", { url: p.baseUrl }));
    } else {
      baseUrlSetting.setDesc(t("settings.providers.baseUrl.custom")).addText((tx) =>
        tx
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
        .setButtonText(
          cached ? t("settings.providers.refreshModels") : t("settings.providers.test"),
        )
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
      new Notice(t("settings.providers.test.fail", { error: (e as Error).message }), 6000);
    } finally {
      this.testingProviders.delete(providerId);
      this.display();
    }
  }

  // ---- AI Roles --------------------------------------------------------
  private renderRoles(root: HTMLElement): void {
    root.createEl("p", { text: t("settings.roles.intro"), cls: "setting-item-description" });

    const roles = this.plugin.core.settings.current.roles;
    for (const r of roles) this.renderRoleRow(root, r);

    new Setting(root).addButton((b) =>
      b
        .setButtonText(t("settings.roles.add"))
        .setCta()
        .onClick(() => this.createCustomRole()),
    );
  }

  private renderRoleRow(root: HTMLElement, r: AiRole): void {
    const row = root.createDiv({ cls: "aether-role-row" });
    if (!r.enabled) row.addClass("aether-role-disabled");
    const name = row.createDiv({ cls: "aether-role-name" });
    name.setText(r.name);
    const binding = row.createDiv({ cls: "aether-role-binding" });
    if (r.providerId) {
      const provider = this.plugin.core.settings.current.providers.find(
        (x) => x.id === r.providerId,
      );
      const providerLabel = provider ? provider.name || provider.kind || provider.id : r.providerId;
      binding.setText(
        t("settings.roles.row.bound", {
          provider: providerLabel,
          model: r.modelName || "—",
        }),
      );
    } else {
      binding.setText(t("settings.roles.row.unbound"));
    }

    row.onclick = () => {
      new RoleEditorModal(
        this.app,
        this.plugin,
        r,
        this.modelCache,
        async (next) => {
          await this.patch((s) => {
            const idx = s.roles.findIndex((x) => x.id === next.id);
            if (idx >= 0) s.roles[idx] = next;
          });
        },
      ).open();
    };

    if (!r.builtIn) {
      const del = row.createEl("button", { text: t("common.remove") });
      del.onclick = (e) => {
        e.stopPropagation();
        this.patch((s) => {
          s.roles = s.roles.filter((x) => x.id !== r.id);
        });
      };
    }
  }

  private async createCustomRole(): Promise<void> {
    const id = newUlid();
    const draft: AiRole = {
      id,
      builtIn: false,
      name: t("settings.roles.newName"),
      icon: "sparkles",
      description: "",
      providerId: "",
      modelName: "",
      promptTemplate: "{{selection}}",
      variables: ["selection"],
      outputKind: "text",
      params: { temperature: 0.4 },
      enabled: true,
      showInEditor: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.patch((s) => {
      s.roles.push(draft);
    });
    new RoleEditorModal(
      this.app,
      this.plugin,
      draft,
      this.modelCache,
      async (next) => {
        await this.patch((s) => {
          const idx = s.roles.findIndex((x) => x.id === next.id);
          if (idx >= 0) s.roles[idx] = next;
        });
      },
    ).open();
  }

  // ---- Advanced ---------------------------------------------------------
  private renderAdvanced(root: HTMLElement): void {
    new Setting(root)
      .setName(t("settings.advanced.inboxFolder"))
      .setDesc(t("settings.advanced.inboxFolder.desc"))
      .addText((tx) =>
        tx.setValue(this.plugin.core.settings.current.ui.aetherInboxFolder).onChange((v) =>
          this.patch((s) => {
            s.ui.aetherInboxFolder = v;
          }),
        ),
      )
      .addExtraButton((b) =>
        b
          .setIcon("folder-open")
          .setTooltip(t("settings.advanced.inboxFolder.open"))
          .onClick(async () => {
            const folder = this.plugin.core.settings.current.ui.aetherInboxFolder;
            if (!folder.trim()) {
              new Notice(t("settings.advanced.inboxFolder.empty"), 3000);
              return;
            }
            try {
              await this.plugin.core.host.openFolder(folder);
            } catch (e) {
              new Notice(
                t("settings.advanced.inboxFolder.openFailed", { error: (e as Error).message }),
                5000,
              );
            }
          }),
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

  // ---- 推荐配置 ---------------------------------------------------------
  private async applyRecommended(): Promise<void> {
    const providers = this.plugin.core.settings.current.providers;
    if (providers.length === 0) return;

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
      const setRole = (id: string, providerId: string, model: string): void => {
        const r = s.roles.find((x) => x.id === id);
        if (!r) return;
        r.providerId = providerId;
        if (!r.modelName) r.modelName = model;
      };
      if (embedProvider) {
        const ps = embedProvider.kind ? findPresetById(embedProvider.kind) : undefined;
        const model = this.modelCache.get(embedProvider.id)?.[0] ?? ps?.fallbackModels?.[0] ?? "";
        setRole("embedding", embedProvider.id, model);
      }
      if (chatProvider) {
        const ps = chatProvider.kind ? findPresetById(chatProvider.kind) : undefined;
        const model = this.modelCache.get(chatProvider.id)?.[0] ?? ps?.fallbackModels?.[0] ?? "";
        for (const id of ["summarize", "rewrite", "extract", "inbox_metadata"]) {
          setRole(id, chatProvider.id, model);
        }
      }
    });
    new Notice(t("settings.bindings.applied"), 3000);
  }
}

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
