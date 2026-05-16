import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";
import { MockProvider } from "../../src/provider/mock-provider.js";
import { newUlid } from "../../src/ids.js";
import type { ImportEvent } from "../../src/import/pipeline.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

async function bootstrap() {
  const host = new InMemoryHostAdapter({
    now: () => 1_700_000_000_000,
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const core = new AetherCore(host);
  await core.init();

  const mock = new MockProvider({
    embedDim: 8,
    chatChunks: () => [
      {
        delta: '{"title":"Hello Notes","tags":["greeting"],"summary":"S"}',
        finishReason: "stop",
      },
    ],
  });
  core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
  await core.settings.save({
    ...core.settings.current,
    providers: [
      {
        id: "p",
        name: "Mock",
        baseUrl: "https://x",
        apiKeyRef: "k",
        defaultHeaders: {},
        enabled: true,
        createdAt: 0,
      },
    ],
    bindings: [
      { feature: "embedding", providerId: "p", modelName: "m", params: {} },
      { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
    ],
    apiKeys: { k: "secret" },
  });
  core.applySettings(core.settings.current);
  return { host, core, mock };
}

describe("import → approve → search flow", () => {
  it("approves an inbox item and finds it via search", async () => {
    const { host, core } = await bootstrap();
    const events = await collect(
      core.importSource({
        kind: "paste",
        label: "test",
        payload: { type: "paste-text", text: "Hello notes about Aether searching" },
      }),
    );
    const added = events.find(
      (e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added",
    );
    expect(added).toBeDefined();
    if (!added) throw new Error("no item-added event");

    const note = await core.approveInboxItem(added.item.id);
    expect(note.title).toBe("Hello Notes");
    expect(await host.exists(note.vaultPath)).toBe(true);

    const hits = await core.search({ query: "Hello notes" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title).toBe("Hello Notes");
  });

  it("discards an inbox item without writing a file", async () => {
    const { host, core } = await bootstrap();
    const events = await collect(
      core.importSource({
        kind: "paste",
        label: "test",
        payload: { type: "paste-text", text: "Will be discarded" },
      }),
    );
    const added = events.find(
      (e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added",
    );
    expect(added).toBeDefined();
    if (!added) throw new Error("no item-added event");
    await core.discardInboxItem(added.item.id);
    expect(core.inbox.getItem(added.item.id)?.status).toBe("discarded");
    const list = await host.listMarkdown("");
    expect(list).toHaveLength(0);
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
