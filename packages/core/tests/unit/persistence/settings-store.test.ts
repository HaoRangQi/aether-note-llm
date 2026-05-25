import { describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { SettingsStore } from "../../../src/persistence/settings-store.js";
import { migrateSettings } from "../../../src/persistence/migrate.js";

describe("migrateSettings", () => {
  it("returns defaults for empty input (lifted to v2)", () => {
    const s = migrateSettings({});
    expect(s.schemaVersion).toBe(2);
    expect(s.providers).toEqual([]);
    expect(s.roles.length).toBe(7); // 7 个内置角色（含 critique / answer）
    expect(s.roles.find((r) => r.id === "summarize")?.builtIn).toBe(true);
    expect(s.ui.alpha).toBe(0.4);
    expect(s.ui.scanScope).toBe("vault");
    expect(s.ui.language).toBe("zh-CN");
    expect(s.flags.aiTrace).toBe(false);
  });

  it("v1 → v2 migrates bindings into role provider/model", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      bindings: [
        { feature: "summarize", providerId: "p1", modelName: "m1", params: {} },
        { feature: "embedding", providerId: "p2", modelName: "m2", params: {} },
      ],
    });
    expect(s.schemaVersion).toBe(2);
    const summarize = s.roles.find((r) => r.id === "summarize");
    expect(summarize?.providerId).toBe("p1");
    expect(summarize?.modelName).toBe("m1");
    const answer = s.roles.find((r) => r.id === "answer");
    expect(answer?.providerId).toBe("p1");
    expect(answer?.modelName).toBe("m1");
    const embedding = s.roles.find((r) => r.id === "embedding");
    expect(embedding?.providerId).toBe("p2");
    // 迁移后老 bindings 字段被清空
    expect(s.bindings).toEqual([]);
  });

  it("normalizes provider role params while preserving prompt variables", () => {
    const fromBindings = migrateSettings({
      schemaVersion: 1,
      bindings: [
        {
          feature: "summarize",
          providerId: "p1",
          modelName: "m1",
          params: {
            temperature: 99,
            maxTokens: -1,
          },
        },
      ],
    });
    expect(fromBindings.roles.find((r) => r.id === "summarize")?.params.temperature).toBe(0.3);
    expect(fromBindings.roles.find((r) => r.id === "summarize")?.params).not.toHaveProperty(
      "maxTokens",
    );

    const fromRoles = migrateSettings({
      schemaVersion: 2,
      roles: [
        {
          id: "rewrite",
          builtIn: true,
          name: "改写",
          icon: "wand",
          description: "",
          providerId: "p2",
          modelName: "m2",
          promptTemplate: "Rewrite {{selection}} as {{style}}",
          variables: ["selection", "style"],
          outputKind: "text",
          params: {
            temperature: Number.NaN,
            maxTokens: 1200.8,
            style: "更清晰",
          },
          enabled: true,
          showInEditor: true,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    expect(fromRoles.roles.find((r) => r.id === "rewrite")?.params).toMatchObject({
      maxTokens: 1200,
      style: "更清晰",
    });
    expect(fromRoles.roles.find((r) => r.id === "rewrite")?.params).not.toHaveProperty(
      "temperature",
    );

    const validTemperature = migrateSettings({
      schemaVersion: 2,
      roles: [
        {
          id: "summarize",
          builtIn: true,
          name: "总结",
          icon: "file-text",
          description: "",
          providerId: "p3",
          modelName: "m3",
          promptTemplate: "Summarize {{selection}}",
          variables: ["selection"],
          outputKind: "text",
          params: {
            temperature: 2,
          },
          enabled: true,
          showInEditor: true,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    expect(validTemperature.roles.find((r) => r.id === "summarize")?.params.temperature).toBe(2);
  });

  it("v2 input keeps user-edited prompt templates", () => {
    const s = migrateSettings({
      schemaVersion: 2,
      roles: [
        {
          id: "summarize",
          builtIn: true,
          name: "总结",
          icon: "file-text",
          description: "",
          providerId: "p",
          modelName: "m",
          promptTemplate: "USER OVERRIDE {{selection}}",
          variables: ["selection"],
          outputKind: "text",
          params: {},
          enabled: true,
          showInEditor: true,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    expect(s.roles.find((r) => r.id === "summarize")?.promptTemplate).toBe(
      "USER OVERRIDE {{selection}}",
    );
    // 缺失的内置角色会自动补齐
    expect(s.roles.find((r) => r.id === "embedding")).toBeDefined();
    expect(s.roles.find((r) => r.id === "answer")).toMatchObject({
      providerId: "p",
      modelName: "m",
    });
  });

  it("preserves provided values", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      ui: {
        alpha: 0.7,
        aetherInboxFolder: "X",
        scanScope: "aether-inbox-only",
        language: "en",
      },
      flags: { aiTrace: true },
    });
    expect(s.ui.alpha).toBe(0.7);
    expect(s.ui.aetherInboxFolder).toBe("X");
    expect(s.ui.language).toBe("en");
    expect(s.flags.aiTrace).toBe(true);
  });

  it("invalid language falls back to zh-CN", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      ui: { language: "fr" },
    });
    expect(s.ui.language).toBe("zh-CN");
  });

  it("normalizes invalid search weight alpha values", () => {
    expect(migrateSettings({ schemaVersion: 2, ui: { alpha: -0.5 } }).ui.alpha).toBe(0);
    expect(migrateSettings({ schemaVersion: 2, ui: { alpha: 1.5 } }).ui.alpha).toBe(1);
    for (const alpha of [Number.NaN, Number.POSITIVE_INFINITY, "0.7"]) {
      expect(migrateSettings({ schemaVersion: 2, ui: { alpha } as never }).ui.alpha).toBe(0.4);
    }
  });

  it("normalizes invalid monthly token budget warnings", () => {
    expect(
      migrateSettings({
        schemaVersion: 2,
        budgets: { monthlyTokenWarn: 1234.9 },
      }).budgets.monthlyTokenWarn,
    ).toBe(1234);
    for (const monthlyTokenWarn of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      "5000",
    ]) {
      expect(
        migrateSettings({
          schemaVersion: 2,
          budgets: { monthlyTokenWarn } as never,
        }).budgets.monthlyTokenWarn,
      ).toBeNull();
    }
  });

  it("backfills provider kind from known baseUrl", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      providers: [
        {
          id: "1",
          name: "DS",
          baseUrl: "https://api.deepseek.com/v1",
          apiKeyRef: "key:1",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
    });
    expect(s.providers[0]?.kind).toBe("deepseek");
  });

  it("backfills kind = 'custom' for unknown baseUrl", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      providers: [
        {
          id: "1",
          name: "X",
          baseUrl: "https://api.unknown.example/v1",
          apiKeyRef: "key:1",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
        },
      ],
    });
    expect(s.providers[0]?.kind).toBe("custom");
  });

  it("keeps existing kind untouched", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      providers: [
        {
          id: "1",
          name: "X",
          baseUrl: "https://api.openai.com/v1",
          apiKeyRef: "key:1",
          defaultHeaders: {},
          enabled: true,
          createdAt: 0,
          kind: "custom",
        },
      ],
    });
    expect(s.providers[0]?.kind).toBe("custom");
  });

  it("throws on unknown schemaVersion", () => {
    expect(() => migrateSettings({ schemaVersion: 99 })).toThrow();
  });
});

describe("SettingsStore", () => {
  it("load returns defaults when no data", async () => {
    const h = new InMemoryHostAdapter();
    const s = new SettingsStore(h);
    const loaded = await s.load();
    expect(loaded.ui.alpha).toBe(0.4);
  });

  it("save then load round-trips", async () => {
    const h = new InMemoryHostAdapter();
    const s = new SettingsStore(h);
    await s.load();
    const next = { ...s.current, ui: { ...s.current.ui, alpha: 0.65 } };
    await s.save(next);
    const s2 = new SettingsStore(h);
    expect((await s2.load()).ui.alpha).toBe(0.65);
  });

  it("backs up & resets when stored JSON is corrupt", async () => {
    const h = new InMemoryHostAdapter({ now: () => 42 });
    await h.writeData("settings.json", "{not json");
    const s = new SettingsStore(h);
    const loaded = await s.load();
    expect(loaded.ui.alpha).toBe(0.4); // reset to defaults
    const bak = await h.readData("settings.json.bak.42");
    expect(bak).not.toBeNull();
  });
});
