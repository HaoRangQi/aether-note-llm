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
    expect(s.flags.aiTrace).toBe(false);
  });

  it("preserves provided values", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      ui: { alpha: 0.7, aetherInboxFolder: "X", scanScope: "aether-inbox-only" },
      flags: { aiTrace: true },
    });
    expect(s.ui.alpha).toBe(0.7);
    expect(s.ui.aetherInboxFolder).toBe("X");
    expect(s.flags.aiTrace).toBe(true);
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
