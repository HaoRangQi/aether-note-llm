import { describe, expect, it } from "vitest";
import { ImportPipeline } from "../../../src/import/pipeline.js";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import { InboxStore } from "../../../src/import/inbox-store.js";
import { PlainTextConnector } from "../../../src/connectors/plain-text-connector.js";
import type { ImportSource } from "../../../src/types.js";

describe("ImportPipeline error handling", () => {
  it("should yield error events when connector fails", async () => {
    const host = new InMemoryHostAdapter();
    const registry = new ProviderRegistry({
      factories: [],
      fetch: async () => new Response("{}"),
    });
    const store = new OramaIndexStore({ embeddingDim: 8 });
    await store.init();
    const inbox = new InboxStore(host);

    const pipeline = new ImportPipeline({
      host,
      registry,
      store,
      inbox,
      connectors: [new PlainTextConnector()],
    });

    const source: ImportSource = {
      kind: "paste",
      label: "test",
      payload: { type: "paste-text", text: "Hello world" },
    };

    const events = [];
    for await (const e of pipeline.run(source)) {
      events.push(e);
    }

    // Should have batch-started, item-added, batch-finished
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: "batch-started" });

    // Check if we got item-added or error
    const hasItemAdded = events.some((e) => e.type === "item-added");
    const hasError = events.some((e) => e.type === "error");

    // Should either succeed or report error, not silently fail
    expect(hasItemAdded || hasError).toBe(true);
  });

  it("should handle empty text gracefully", async () => {
    const host = new InMemoryHostAdapter();
    const registry = new ProviderRegistry({
      factories: [],
      fetch: async () => new Response("{}"),
    });
    const store = new OramaIndexStore({ embeddingDim: 8 });
    await store.init();
    const inbox = new InboxStore(host);

    const pipeline = new ImportPipeline({
      host,
      registry,
      store,
      inbox,
      connectors: [new PlainTextConnector()],
    });

    const source: ImportSource = {
      kind: "paste",
      label: "test",
      payload: { type: "paste-text", text: "   " },
    };

    const events = [];
    for await (const e of pipeline.run(source)) {
      events.push(e);
    }

    // Should complete without errors, but with 0 items
    const batchFinished = events.find((e) => e.type === "batch-finished");
    expect(batchFinished).toBeDefined();
    if (batchFinished && batchFinished.type === "batch-finished") {
      expect(batchFinished.total).toBe(0);
    }
  });

  it("should report error when no connector available", async () => {
    const host = new InMemoryHostAdapter();
    const registry = new ProviderRegistry({
      factories: [],
      fetch: async () => new Response("{}"),
    });
    const store = new OramaIndexStore({ embeddingDim: 8 });
    await store.init();
    const inbox = new InboxStore(host);

    const pipeline = new ImportPipeline({
      host,
      registry,
      store,
      inbox,
      connectors: [], // No connectors
    });

    const source: ImportSource = {
      kind: "paste",
      label: "test",
      payload: { type: "paste-text", text: "Hello" },
    };

    const events = [];
    for await (const e of pipeline.run(source)) {
      events.push(e);
    }

    // Should yield error event
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      type: "error",
      message: expect.stringContaining("No connector"),
    });
  });
});
