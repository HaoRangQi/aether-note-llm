export type PluginDataRecord = Record<string, unknown>;

export interface PluginDataHost {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

/**
 * Serializes access to Obsidian's single plugin data.json object.
 *
 * Core stores string payloads under keys such as settings.json/index.json/usage.json,
 * while plugin UI stores structured values such as jobHistory. All mutations must
 * share one queue so concurrent load-modify-save cycles do not overwrite each other.
 */
export class PluginDataStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly host: PluginDataHost) {}

  read<T>(reader: (data: PluginDataRecord) => T): Promise<T> {
    return this.run(async () => reader(normalizeData(await this.host.loadData())));
  }

  update<T>(mutator: (data: PluginDataRecord) => T): Promise<T> {
    return this.run(async () => {
      const data = normalizeData(await this.host.loadData());
      const result = mutator(data);
      await this.host.saveData(data);
      return result;
    });
  }

  getString(key: string): Promise<string | null> {
    return this.read((data) => {
      const value = data[key];
      return typeof value === "string" ? value : null;
    });
  }

  setString(key: string, value: string): Promise<void> {
    return this.update((data) => {
      data[key] = value;
    });
  }

  getBoolean(key: string): Promise<boolean> {
    return this.read((data) => data[key] === true);
  }

  setBoolean(key: string, value: boolean): Promise<void> {
    return this.update((data) => {
      data[key] = value;
    });
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

function normalizeData(value: unknown): PluginDataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as PluginDataRecord;
}
