import type { IHostAdapter } from "../host/adapter.js";
import type {
  InboxBatch,
  InboxItem,
  InboxStatus,
  PersistedInbox,
} from "../types.js";

const STORAGE_KEY = "inbox.json";

export class InboxStore {
  private items = new Map<string, InboxItem>();
  private batches = new Map<string, InboxBatch>();

  constructor(private readonly host: IHostAdapter) {}

  async load(): Promise<void> {
    const raw = await this.host.readData(STORAGE_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as PersistedInbox;
      for (const it of payload.items) this.items.set(it.id, it);
      for (const b of payload.batches) this.batches.set(b.id, b);
    } catch {
      // Corrupt — start empty; caller may show a notice if desired.
    }
  }

  async save(): Promise<void> {
    const payload: PersistedInbox = {
      schemaVersion: 1,
      items: [...this.items.values()],
      batches: [...this.batches.values()],
      updatedAt: this.host.now(),
    };
    await this.host.writeData(STORAGE_KEY, JSON.stringify(payload, null, 2));
  }

  createBatch(args: { id: string; sourceLabel: string; totalItems: number }): InboxBatch {
    const batch: InboxBatch = {
      id: args.id,
      createdAt: this.host.now(),
      sourceLabel: args.sourceLabel,
      totalItems: args.totalItems,
      archived: false,
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  addItem(item: InboxItem): void {
    this.items.set(item.id, item);
  }

  getItem(id: string): InboxItem | undefined {
    return this.items.get(id);
  }

  listItems(filter?: { batchId?: string; status?: InboxStatus }): InboxItem[] {
    return [...this.items.values()].filter((it) => {
      if (filter?.batchId && it.batchId !== filter.batchId) return false;
      if (filter?.status && it.status !== filter.status) return false;
      return true;
    });
  }

  listBatches(): InboxBatch[] {
    return [...this.batches.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  updateStatus(itemId: string, status: InboxStatus): InboxItem | undefined {
    const item = this.items.get(itemId);
    if (!item) return undefined;
    const next: InboxItem = { ...item, status, decidedAt: this.host.now() };
    this.items.set(itemId, next);
    return next;
  }

  /** Mark a batch archived once all items are decided. Idempotent. */
  maybeArchive(batchId: string): void {
    const batch = this.batches.get(batchId);
    if (!batch || batch.archived) return;
    const pending = this.listItems({ batchId, status: "pending" });
    if (pending.length === 0) {
      this.batches.set(batchId, { ...batch, archived: true });
    }
  }

  /** GC discarded items older than `retentionMs`. */
  gc(retentionMs: number): number {
    const cutoff = this.host.now() - retentionMs;
    let removed = 0;
    for (const [id, it] of this.items) {
      if (it.status === "discarded" && (it.decidedAt ?? it.createdAt) < cutoff) {
        this.items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
