import type { IHostAdapter } from "../host/adapter.js";
import { migrateSettings } from "./migrate.js";
import type { PersistedSettings } from "../types.js";

const KEY = "settings.json";

export class SettingsStore {
  private settings: PersistedSettings = migrateSettings({});

  constructor(private readonly host: IHostAdapter) {}

  async load(): Promise<PersistedSettings> {
    const raw = await this.host.readData(KEY);
    if (raw === null) {
      this.settings = migrateSettings({});
      return this.settings;
    }
    try {
      this.settings = migrateSettings(JSON.parse(raw));
    } catch {
      // Corrupt — back up and reset.
      await this.host.writeData(`${KEY}.bak.${this.host.now()}`, raw);
      this.settings = migrateSettings({});
    }
    return this.settings;
  }

  async save(next: PersistedSettings): Promise<void> {
    this.settings = next;
    await this.host.writeData(KEY, JSON.stringify(next, null, 2));
  }

  get current(): PersistedSettings {
    return this.settings;
  }
}
