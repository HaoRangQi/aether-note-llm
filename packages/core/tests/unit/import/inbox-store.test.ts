import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { InboxStore } from "../../../src/import/inbox-store.js";
import type { InboxItem } from "../../../src/types.js";

function mkItem(id: string, batchId: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    batchId,
    sourceKind: "file",
    sourceRef: "x",
    proposedTitle: id,
    proposedTags: [],
    proposedSummary: "",
    content: "body",
    kind: "note",
    url: null,
    duplicateOf: null,
    status: "pending",
    createdAt: 1_000_000,
    decidedAt: null,
    ...overrides,
  };
}

describe("InboxStore", () => {
  let host: InMemoryHostAdapter;
  let store: InboxStore;
  beforeEach(() => {
    host = new InMemoryHostAdapter({ now: () => 5_000_000 });
    store = new InboxStore(host);
  });

  it("createBatch + addItem + listItems", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 2 });
    store.addItem(mkItem("i1", "b1"));
    store.addItem(mkItem("i2", "b1"));
    expect(store.listItems({ batchId: "b1" })).toHaveLength(2);
  });

  it("updateStatus sets decidedAt", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 1 });
    store.addItem(mkItem("i1", "b1"));
    const updated = store.updateStatus("i1", "approved");
    expect(updated?.status).toBe("approved");
    expect(updated?.decidedAt).toBe(5_000_000);
  });

  it("maybeArchive when no pending", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 1 });
    store.addItem(mkItem("i1", "b1"));
    store.maybeArchive("b1");
    expect(store.listBatches()[0]?.archived).toBe(false);
    store.updateStatus("i1", "approved");
    store.maybeArchive("b1");
    expect(store.listBatches()[0]?.archived).toBe(true);
  });

  it("gc removes discarded items older than retention", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 2 });
    store.addItem(mkItem("i1", "b1", { status: "discarded", decidedAt: 1_000_000 }));
    store.addItem(mkItem("i2", "b1", { status: "pending" }));
    // retentionMs = 1_000_000 means anything older than (5_000_000 - 1_000_000) = 4_000_000
    const removed = store.gc(1_000_000);
    expect(removed).toBe(1);
    expect(store.getItem("i1")).toBeUndefined();
    expect(store.getItem("i2")).toBeDefined();
  });

  it("save + load round-trip", async () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 1 });
    store.addItem(mkItem("i1", "b1"));
    await store.save();

    const store2 = new InboxStore(host);
    await store2.load();
    expect(store2.listItems()).toHaveLength(1);
    expect(store2.listBatches()).toHaveLength(1);
  });

  it("load tolerates corrupt JSON without throwing", async () => {
    await host.writeData("inbox.json", "{not json");
    const s = new InboxStore(host);
    await expect(s.load()).resolves.toBeUndefined();
    expect(s.listItems()).toEqual([]);
  });
});
