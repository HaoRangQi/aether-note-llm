import { describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { SettingsStore } from "../../../src/persistence/settings-store.js";
import { migrateSettings } from "../../../src/persistence/migrate.js";

describe("migrateSettings", () => {
  it("returns defaults for empty input", () => {
    const s = migrateSettings({});
    expect(s.schemaVersion).toBe(1);
    expect(s.providers).toEqual([]);
    expect(s.ui.alpha).toBe(0.4);
    expect(s.ui.scanScope).toBe("vault");
    expect(s.ui.language).toBe("zh-CN");
    expect(s.flags.aiTrace).toBe(false);
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
