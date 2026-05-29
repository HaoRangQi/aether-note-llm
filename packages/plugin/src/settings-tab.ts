import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type AetherPlugin from "./main.js";
import {
  DEFAULT_IMPORT_CATEGORIES,
  PROVIDER_PRESETS,
  findPresetById,
  newUlid,
  type AiRole,
  type ImportCategory,
  type ProviderConfig,
} from "@aether/core";
import { ApiKeyModal } from "./modals/api-key-modal.js";
import { RoleEditorModal } from "./modals/role-editor.js";
import { RebuildPromptModal } from "./modals/rebuild-prompt.js";
import { setLocale, t } from "./i18n/index.js";
import { runRebuildJob, runRefreshIndexJob } from "./ui/job-tracker.js";
import { chooseModelForUse, mergeModels, type ModelUse } from "./ui/model-selection.js";
import { openExternalLink } from "./ui/external-link.js";

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
  private expandedProviderId = "";
  private importCategoriesOpen = true;
  /** Quick Start 里「绑定向导」当前选择，未保存到 settings 直到点应用。 */
  private bindWizard = { chatProviderId: "", embeddingProviderId: "" };

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

  /**
   * 持久化 + 应用。会触发整个 Settings 重新渲染——任何变更影响其他控件状态时必须用它。
   * （比如：切预设要让 baseUrl 行换形态、删 Provider 要让卡片消失。）
   */
  private async patch(update: (s: ReturnType<typeof this.snapshot>) => void): Promise<void> {
    const next = this.snapshot();
    update(next);
    await this.plugin.core.settings.save(next);
    this.plugin.core.applySettings(next);
    setLocale(next.ui.language);
    this.display();
  }

  /**
   * 持久化 + 应用，但不重新渲染。文本输入用这个，避免每打一个字 input 失焦。
   */
  private async patchSilent(update: (s: ReturnType<typeof this.snapshot>) => void): Promise<void> {
    const next = this.snapshot();
    update(next);
    await this.plugin.core.settings.save(next);
    this.plugin.core.applySettings(next);
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
      this.renderBindWizard(root, providers);
    }
  }

  /**
   * 绑定向导：让用户明确选定「聊天用哪个 Provider / 向量用哪个 Provider」，
   * 而不是黑盒的"一键推荐"。多 Provider 时用户能精准选择。
   */
  private renderBindWizard(root: HTMLElement, providers: ProviderConfig[]): void {
    root.createEl("h3", { text: t("settings.quickStart.bindTitle") });
    root.createEl("p", {
      text: t("settings.quickStart.bindDesc"),
      cls: "setting-item-description",
    });

    // 默认值：chat 取第一个 recommendedFor.chat 的；embedding 必须明确支持，避免把 chat-only 服务商绑定成向量模型。
    const fallback = providers[0]!.id;
    const chatProviders = providers.filter((p) => providerSupportsUse(p, "chat"));
    const embeddingProviders = providers.filter((p) => providerSupportsUse(p, "embedding"));
    if (!this.bindWizard.chatProviderId) {
      this.bindWizard.chatProviderId = chatProviders[0]?.id ?? fallback;
    }
    if (!this.bindWizard.embeddingProviderId) {
      this.bindWizard.embeddingProviderId = embeddingProviders[0]?.id ?? "";
    }
    if (!embeddingProviders.some((p) => p.id === this.bindWizard.embeddingProviderId)) {
      this.bindWizard.embeddingProviderId = embeddingProviders[0]?.id ?? "";
    }

    const mkRow = (
      label: string,
      desc: string,
      key: "chatProviderId" | "embeddingProviderId",
      options: ProviderConfig[],
    ): void => {
      new Setting(root)
        .setName(label)
        .setDesc(desc)
        .addDropdown((d) => {
          if (options.length === 0 && key === "embeddingProviderId") {
            d.addOption("", t("settings.quickStart.noEmbeddingProvider"));
          }
          for (const p of options) {
            d.addOption(p.id, p.name || p.kind || p.id);
          }
          d.setValue(this.bindWizard[key]);
          d.onChange((v) => {
            this.bindWizard[key] = v;
          });
        });
    };
    mkRow(
      t("settings.quickStart.bindChat"),
      t("settings.quickStart.bindChat.desc"),
      "chatProviderId",
      chatProviders.length > 0 ? chatProviders : providers,
    );
    mkRow(
      t("settings.quickStart.bindEmbedding"),
      t("settings.quickStart.bindEmbedding.desc"),
      "embeddingProviderId",
      embeddingProviders,
    );
    if (embeddingProviders.length === 0) {
      root.createEl("p", {
        text: t("settings.quickStart.noEmbeddingProvider.desc"),
        cls: "setting-item-description",
      });
    }

    new Setting(root).addButton((b) => {
      b.setButtonText(t("settings.quickStart.applyBind"))
        .setCta()
        .onClick(() => this.applyBindWizard());
    });
  }

  /** 把 bindWizard 选择真正写入 roles[]。每个内置 role 按类别绑到选定的 provider。 */
  private async applyBindWizard(): Promise<void> {
    const chatId = this.bindWizard.chatProviderId;
    const embedId = this.bindWizard.embeddingProviderId;
    if (!chatId && !embedId) return;
    const providers = this.plugin.core.settings.current.providers;
    const chatProvider = providers.find((p) => p.id === chatId);
    const embedProvider = providers.find(
      (p) => p.id === embedId && providerSupportsUse(p, "embedding"),
    );
    if (!chatProvider && !embedProvider) {
      new Notice(t("settings.bindings.empty"), 4000);
      return;
    }

    await this.patch((s) => {
      const setRole = (id: string, providerId: string, model: string): void => {
        const r = s.roles.find((x) => x.id === id);
        if (!r) return;
        r.providerId = providerId;
        r.modelName = model;
      };
      if (embedProvider) {
        const ps = embedProvider.kind ? findPresetById(embedProvider.kind) : undefined;
        const model = chooseModelForUse(
          this.modelCache.get(embedProvider.id),
          ps?.fallbackModels,
          "embedding",
          { allowUnclassifiedEmbedding: !ps || ps.id === "custom" },
        );
        if (!model) return;
        setRole("embedding", embedProvider.id, model);
      }
      if (chatProvider) {
        const ps = chatProvider.kind ? findPresetById(chatProvider.kind) : undefined;
        const model = chooseModelForUse(
          this.modelCache.get(chatProvider.id),
          ps?.fallbackModels,
          "chat",
        );
        if (!model) return;
        for (const id of [
          "summarize",
          "rewrite",
          "extract",
          "critique",
          "answer",
          "inbox_metadata",
        ]) {
          setRole(id, chatProvider.id, model);
        }
      }
    });
    new Notice(
      t("settings.quickStart.applied", {
        chat: chatProvider?.name || chatProvider?.id || "—",
        embed: embedProvider?.name || embedProvider?.id || "—",
      }),
      4000,
    );
  }

  private async duplicateProvider(p: ProviderConfig): Promise<void> {
    const id = newUlid();
    const apiKeyRef = `key:${id}`;
    const oldKey = this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "";
    this.expandedProviderId = id;
    await this.patch((s) => {
      s.providers.push({
        ...p,
        id,
        name: p.name ? `${p.name} (副本)` : "",
        apiKeyRef,
        createdAt: Date.now(),
        trustedForPrivate: p.trustedForPrivate === true,
      });
      if (oldKey) s.apiKeys[apiKeyRef] = oldKey;
    });
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
      trustedForPrivate: false,
    };
    await this.patch((s) => {
      s.providers.push(config);
    });
    this.currentSection = "providers";
    this.expandedProviderId = id;
    this.display();
    new Notice(t("settings.quickStart.providerAdded", { name: ps.displayName }), 4000);
  }

  // ---- Providers --------------------------------------------------------
  private renderProviders(root: HTMLElement): void {
    root.createDiv({
      cls: "aether-provider-risk-note",
      text: t("settings.providers.riskHint"),
    });
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
          this.expandedProviderId = id;
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
              trustedForPrivate: false,
            });
          });
        }),
    );
  }

  private renderProviderCard(root: HTMLElement, p: ProviderConfig): void {
    const preset = p.kind ? findPresetById(p.kind) : undefined;
    const apiKeySet = (this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "").length > 0;
    const cached = this.modelCache.get(p.id);
    const displayName = p.name || preset?.displayName || p.id;
    const keyDot = apiKeySet ? "●" : "○";
    const modelHint = cached ? `${cached.length} 个模型` : "";

    // —— 折叠卡片：summary 一行显示核心状态，默认收起 ——
    const details = root.createEl("details", { cls: "aether-provider-card" });
    details.open = p.id === this.expandedProviderId;
    const summary = details.createEl("summary", { cls: "aether-provider-summary" });
    const toggleIcon = summary.createSpan({ cls: "aether-provider-toggle-icon" });
    setIcon(toggleIcon, "chevron-right");
    summary.createSpan({ cls: "aether-provider-summary-name", text: displayName });
    const badges = summary.createSpan({ cls: "aether-provider-summary-badges" });
    badges.createSpan({
      cls: `aether-provider-key-dot ${apiKeySet ? "set" : "unset"}`,
      text: keyDot,
      title: apiKeySet ? t("settings.providers.apiKey.set") : t("settings.providers.apiKey.unset"),
    });
    if (modelHint) badges.createSpan({ cls: "aether-provider-model-hint", text: modelHint });
    // 复制按钮放在 summary 里，阻止冒泡避免触发折叠
    const dupBtn = summary.createEl("button", {
      cls: "aether-provider-dup-btn",
      text: t("settings.providers.duplicate"),
      title: t("settings.providers.duplicate.desc"),
    });
    dupBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.duplicateProvider(p);
    };

    const delBtn = summary.createEl("button", {
      cls: "aether-provider-del-btn",
      text: "✕",
      title: t("common.remove"),
    });
    delBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.patch((s) => {
        s.providers = s.providers.filter((x) => x.id !== p.id);
        for (const r of s.roles) {
          if (r.providerId === p.id) {
            r.providerId = "";
            r.modelName = "";
          }
        }
        delete s.apiKeys[p.apiKeyRef];
      });
    };

    const card = details; // 内容区就是 details 本身
    card.createDiv({
      cls: "aether-provider-card-risk-note",
      text: t("settings.providers.riskHint"),
    });
    new Setting(card)
      .setName(t("settings.providers.trustedPrivate"))
      .setDesc(t("settings.providers.trustedPrivate.desc"))
      .addDropdown((d) => {
        d.addOption("false", t("settings.providers.trustedPrivate.off"));
        d.addOption("true", t("settings.providers.trustedPrivate.on"));
        d.setValue(p.trustedForPrivate === true ? "true" : "false");
        d.onChange((v) =>
          this.patch((s) => {
            const found = s.providers.find((x) => x.id === p.id);
            if (!found) return;
            found.trustedForPrivate = v === "true";
          }),
        );
      });

    // —— 行 0：名称 ——
    new Setting(card)
      .setName(t("settings.providers.name"))
      .setDesc(t("settings.providers.name.desc"))
      .addText((tx) =>
        tx
          .setPlaceholder(preset?.displayName ?? t("settings.providers.name.placeholder"))
          .setValue(p.name)
          .onChange((v) =>
            this.patchSilent((s) => {
              const found = s.providers.find((x) => x.id === p.id);
              if (found) found.name = v;
            }),
          ),
      );

    new Setting(card).setName(t("settings.providers.preset")).addDropdown((d) => {
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
    });

    const baseUrlSetting = new Setting(card).setName(t("settings.providers.baseUrl"));
    if (preset && preset.id !== "custom") {
      baseUrlSetting.setDesc(t("settings.providers.baseUrl.preset", { url: p.baseUrl }));
    } else {
      baseUrlSetting.setDesc(t("settings.providers.baseUrl.custom")).addText((tx) =>
        tx
          .setPlaceholder("https://api.example.com/v1")
          .setValue(p.baseUrl)
          .onChange((v) =>
            this.patchSilent((s) => {
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
          .onClick(() =>
            openExternalLink(signupUrl, {
              failureMessage: (error) => t("settings.providers.signupOpenFailed", { error }),
              notify: (message, timeoutMs) => new Notice(message, timeoutMs),
            }),
          ),
      );
    }

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
    const privateBinding = this.describeRolePrivateBinding(r);
    if (r.providerId) {
      const provider = this.plugin.core.settings.current.providers.find(
        (x) => x.id === r.providerId,
      );
      const providerLabel = provider ? provider.name || provider.kind || provider.id : r.providerId;
      const publicText = t("settings.roles.row.bound", {
        provider: providerLabel,
        model: r.modelName || "—",
      });
      binding.setText(
        t("settings.roles.row.bound", {
          provider: providerLabel,
          model: r.modelName || "—",
        }),
      );
      if (privateBinding) {
        binding.setText(`${publicText} · ${privateBinding}`);
      }
    } else {
      binding.setText(
        privateBinding
          ? `${t("settings.roles.row.unbound")} · ${privateBinding}`
          : t("settings.roles.row.unbound"),
      );
    }

    row.onclick = () => {
      const before = this.plugin.core.settings.current.roles.find((x) => x.id === r.id);
      new RoleEditorModal(this.app, this.plugin, r, this.modelCache, async (next) => {
        await this.patch((s) => {
          const idx = s.roles.findIndex((x) => x.id === next.id);
          if (idx >= 0) s.roles[idx] = next;
        });
        this.maybePromptRebuild(before, next);
      }).open();
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
    new RoleEditorModal(this.app, this.plugin, draft, this.modelCache, async (next) => {
      const before = this.plugin.core.settings.current.roles.find((x) => x.id === next.id);
      await this.patch((s) => {
        const idx = s.roles.findIndex((x) => x.id === next.id);
        if (idx >= 0) s.roles[idx] = next;
      });
      this.maybePromptRebuild(before, next);
    }).open();
  }

  /**
   * 改完 embedding role 且新旧 provider/model 不同、index 里有数据时，弹 Modal。
   * 仅 embedding —— 其他角色改了不会让索引失效。
   */
  private maybePromptRebuild(prev: AiRole | undefined, next: AiRole): void {
    if (next.id !== "embedding") return;
    if (!next.providerId || !next.modelName) return;
    if (prev && prev.providerId === next.providerId && prev.modelName === next.modelName) {
      return;
    }
    const chunkCount = this.plugin.core.store.allChunks().length;
    if (chunkCount === 0) return;
    new RebuildPromptModal(this.app, this.plugin, {
      oldModel: prev?.modelName,
      newModel: next.modelName,
      chunkCount,
    }).open();
  }

  private describeRolePrivateBinding(role: AiRole): string {
    const privateProviderId = role.privateProviderId?.trim() ?? "";
    const privateModelName = role.privateModelName?.trim() ?? "";
    if (!privateProviderId || !privateModelName) return "";
    const provider = this.plugin.core.settings.current.providers.find(
      (p) => p.id === privateProviderId,
    );
    const providerLabel = provider
      ? provider.name || provider.kind || provider.id
      : privateProviderId;
    return t("settings.roles.row.privateBound", {
      provider: providerLabel,
      model: privateModelName,
    });
  }

  // ---- Advanced ---------------------------------------------------------
  private renderAdvanced(root: HTMLElement): void {
    const folderSetting = new Setting(root)
      .setName(t("settings.advanced.inboxFolder"))
      .setDesc(t("settings.advanced.inboxFolder.desc"))
      .addText((tx) =>
        tx.setValue(this.plugin.core.settings.current.ui.aetherInboxFolder).onChange((v) =>
          this.patchSilent((s) => {
            s.ui.aetherInboxFolder = v;
          }),
        ),
      );

    if (this.plugin.core.canOpenImportFolder()) {
      folderSetting.addExtraButton((b) =>
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
              await this.plugin.core.openImportFolder();
            } catch (e) {
              new Notice(
                t("settings.advanced.inboxFolder.openFailed", { error: (e as Error).message }),
                5000,
              );
            }
          }),
      );
    }

    this.renderImportCategories(root);

    root.createEl("h3", { text: t("settings.privacy.title") });
    root.createEl("p", {
      cls: "setting-item-description",
      text: t("settings.privacy.desc"),
    });
    new Setting(root)
      .setName(t("settings.privacy.privateFolders"))
      .setDesc(t("settings.privacy.privateFolders.desc"))
      .addText((tx) =>
        tx
          .setPlaceholder("Private, Aether Private Inbox")
          .setValue(this.plugin.core.settings.current.privacy.privateFolders.join(", "))
          .onChange((v) =>
            this.patchSilent((s) => {
              s.privacy.privateFolders = parsePrivateFolders(v);
            }),
          ),
      );

    new Setting(root)
      .setName(t("settings.privacy.privateInboxFolder"))
      .setDesc(t("settings.privacy.privateInboxFolder.desc"))
      .addText((tx) =>
        tx
          .setPlaceholder("Aether Private Inbox")
          .setValue(this.plugin.core.settings.current.privacy.privateInboxFolder)
          .onChange((v) =>
            this.patchSilent((s) => {
              const next = v.trim();
              if (next.length > 0) s.privacy.privateInboxFolder = next;
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
            this.patchSilent((s) => {
              s.ui.alpha = v;
            }),
          ),
      );

    new Setting(root)
      .setName(t("settings.advanced.monthlyTokenWarn"))
      .setDesc(t("settings.advanced.monthlyTokenWarn.desc"))
      .addText((tx) =>
        tx
          .setPlaceholder(t("settings.advanced.monthlyTokenWarn.placeholder"))
          .setValue(
            this.plugin.core.settings.current.budgets.monthlyTokenWarn === null
              ? ""
              : String(this.plugin.core.settings.current.budgets.monthlyTokenWarn),
          )
          .onChange((v) =>
            this.patchSilent((s) => {
              const trimmed = v.trim();
              if (trimmed === "") {
                s.budgets.monthlyTokenWarn = null;
                return;
              }
              const parsed = Number(trimmed);
              if (Number.isFinite(parsed) && parsed > 0) {
                s.budgets.monthlyTokenWarn = Math.floor(parsed);
              }
            }),
          ),
      );

    new Setting(root)
      .setName(t("settings.advanced.refresh"))
      .setDesc(t("settings.advanced.refresh.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.advanced.refresh.button")).onClick(async () => {
          b.setDisabled(true);
          try {
            await runRefreshIndexJob(this.plugin, {
              onDone: () => {
                b.setDisabled(false);
              },
              onCancel: () => {
                b.setDisabled(false);
              },
              onError: () => {
                b.setDisabled(false);
              },
              onAlreadyRunning: () => {
                b.setDisabled(false);
              },
            });
          } finally {
            b.setDisabled(false);
          }
        }),
      );

    new Setting(root)
      .setName(t("settings.advanced.rebuild"))
      .setDesc(t("settings.advanced.rebuild.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.advanced.rebuild.button")).onClick(async () => {
          b.setDisabled(true);
          try {
            await runRebuildJob(this.plugin, {
              onDone: () => {
                b.setDisabled(false);
              },
              onCancel: () => {
                b.setDisabled(false);
              },
              onError: () => {
                b.setDisabled(false);
              },
              onAlreadyRunning: () => {
                b.setDisabled(false);
              },
            });
          } finally {
            b.setDisabled(false);
          }
        }),
      );
  }

  private renderImportCategories(root: HTMLElement): void {
    const details = root.createEl("details", { cls: "aether-import-categories-card" });
    details.open = this.importCategoriesOpen;
    details.addEventListener("toggle", () => {
      this.importCategoriesOpen = details.open;
    });

    const summary = details.createEl("summary", { cls: "aether-import-categories-summary" });
    const toggleIcon = summary.createSpan({ cls: "aether-import-categories-toggle-icon" });
    setIcon(toggleIcon, "chevron-right");
    const titleWrap = summary.createSpan({ cls: "aether-import-categories-heading" });
    titleWrap.createSpan({
      cls: "aether-import-categories-title",
      text: t("settings.importCategories.title"),
    });
    titleWrap.createSpan({
      cls: "aether-import-categories-count",
      text: `${this.plugin.core.settings.current.importing.categories.length}`,
    });

    const body = details.createDiv({ cls: "aether-import-categories-body" });
    body.createEl("p", {
      cls: "setting-item-description",
      text: t("settings.importCategories.desc"),
    });
    const list = body.createDiv({ cls: "aether-import-categories-list" });
    for (const category of this.plugin.core.settings.current.importing.categories) {
      this.renderImportCategoryRow(list, category);
    }
    new Setting(body)
      .setName(t("settings.importCategories.add"))
      .setDesc(t("settings.importCategories.add.desc"))
      .addButton((button) =>
        button.setButtonText(t("settings.importCategories.add.button")).onClick(() =>
          this.patch((s) => {
            const id = uniqueCategoryId(s.importing.categories);
            s.importing.categories.push({
              id,
              label: t("settings.importCategories.newLabel"),
              folderName: t("settings.importCategories.newLabel"),
              keywords: [],
            });
          }),
        ),
      )
      .addButton((button) =>
        button.setButtonText(t("settings.importCategories.restoreDefaults")).onClick(() =>
          this.patch((s) => {
            s.importing.categories = DEFAULT_IMPORT_CATEGORIES.map((category) => ({
              ...category,
              keywords: [...category.keywords],
            }));
          }),
        ),
      );
  }

  private renderImportCategoryRow(parent: HTMLElement, category: ImportCategory): void {
    const row = parent.createDiv({ cls: "aether-import-category-row" });
    row.createDiv({
      cls: "setting-item-name",
      text: `${category.label} · ${category.id}`,
    });
    new Setting(row).setName(t("settings.importCategories.label")).addText((tx) =>
      tx.setValue(category.label).onChange((value) =>
        this.patchSilent((s) => {
          const target = s.importing.categories.find((c) => c.id === category.id);
          if (target) target.label = value.trim() || category.label;
        }),
      ),
    );
    new Setting(row).setName(t("settings.importCategories.folder")).addText((tx) =>
      tx.setValue(category.folderName).onChange((value) =>
        this.patchSilent((s) => {
          const target = s.importing.categories.find((c) => c.id === category.id);
          if (target) target.folderName = value.trim() || target.label;
        }),
      ),
    );
    new Setting(row).setName(t("settings.importCategories.keywords")).addText((tx) =>
      tx.setValue(category.keywords.join(", ")).onChange((value) =>
        this.patchSilent((s) => {
          const target = s.importing.categories.find((c) => c.id === category.id);
          if (target) target.keywords = parseCommaList(value).slice(0, 12);
        }),
      ),
    );
    if (category.id !== "other") {
      const remove = row.createEl("button", { text: t("common.remove") });
      remove.onclick = () => {
        void this.patch((s) => {
          s.importing.categories = s.importing.categories.filter((c) => c.id !== category.id);
        });
      };
    }
  }

  // ---- 推荐配置 ---------------------------------------------------------
  // (已被 renderBindWizard / applyBindWizard 取代)
}

function providerSupportsUse(provider: ProviderConfig, use: ModelUse): boolean {
  const preset = provider.kind ? findPresetById(provider.kind) : undefined;
  if (!preset || preset.id === "custom") return true;
  return Boolean(preset.recommendedFor[use]);
}

function parsePrivateFolders(raw: string): string[] {
  const defaults = ["Private", "Aether Private Inbox"];
  const seen = new Set<string>();
  const folders: string[] = [];
  for (const part of raw.split(/[,，\n]+/)) {
    const normalized = part.trim().replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    folders.push(normalized);
  }
  return folders.length > 0 ? folders : defaults;
}

function parseCommaList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,，\n]+/)) {
    const normalized = part.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function uniqueCategoryId(categories: ImportCategory[]): string {
  let n = categories.length + 1;
  while (categories.some((category) => category.id === `custom-${n}`)) {
    n += 1;
  }
  return `custom-${n}`;
}
