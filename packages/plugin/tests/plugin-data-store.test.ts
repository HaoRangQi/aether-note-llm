import { describe, expect, it } from "vitest";
import { PluginDataStore } from "../src/plugin-data-store.js";

class DelayedDataHost {
  data: unknown = {};
  saveStarted: Promise<void>;
  private saveDelay: Promise<void> | null = null;
  private resolveSaveStarted: (() => void) | null = null;
  private releaseSave: (() => void) | null = null;

  constructor() {
    this.saveStarted = new Promise((resolve) => {
      this.resolveSaveStarted = resolve;
    });
  }

  async loadData(): Promise<unknown> {
    return structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    if (!this.saveDelay) {
      this.saveDelay = new Promise((resolve) => {
        this.releaseSave = resolve;
      });
      this.resolveSaveStarted?.();
      await this.saveDelay;
    }
    this.data = structuredClone(data);
  }

  releaseFirstSave(): void {
    this.releaseSave?.();
  }
}

describe("PluginDataStore", () => {
  it("serializes concurrent updates so later saves preserve earlier keys", async () => {
    const host = new DelayedDataHost();
    const store = new PluginDataStore(host);

    const first = store.setString("settings.json", "settings");
    const second = store.update((data) => {
      data.jobHistory = [{ id: "job-1" }];
    });

    await host.saveStarted;
    host.releaseFirstSave();
    await Promise.all([first, second]);

    expect(host.data).toEqual({
      "settings.json": "settings",
      jobHistory: [{ id: "job-1" }],
    });
  });

  it("returns null for non-string values through getString", async () => {
    const host = new DelayedDataHost();
    host.data = { jobHistory: [] };
    const store = new PluginDataStore(host);

    expect(await store.getString("jobHistory")).toBeNull();
  });

  it("reads and writes boolean plugin flags", async () => {
    const host = new DelayedDataHost();
    const store = new PluginDataStore(host);

    expect(await store.getBoolean("hasOpenedHubOnboarding")).toBe(false);
    const write = store.setBoolean("hasOpenedHubOnboarding", true);
    await host.saveStarted;
    host.releaseFirstSave();
    await write;

    expect(await store.getBoolean("hasOpenedHubOnboarding")).toBe(true);
    expect(host.data).toEqual({ hasOpenedHubOnboarding: true });
  });
});
