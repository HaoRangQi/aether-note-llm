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
    roles: core.settings.current.roles.map((r) => ({
      ...r,
      providerId: "p",
      modelName: "m",
    })),
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

  it("approves edited inbox metadata from import preview", async () => {
    const { host, core } = await bootstrap();
    const events = await collect(
      core.importSource({
        kind: "paste",
        label: "test",
        payload: { type: "paste-text", text: "Draft content about edited metadata" },
      }),
    );
    const added = events.find(
      (e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added",
    );
    expect(added).toBeDefined();
    if (!added) throw new Error("no item-added event");

    await core.updateInboxItemDraft(added.item.id, {
      proposedTitle: "Edited Preview Title",
      proposedSummary: "Edited preview summary",
      proposedTags: ["edited", "#preview", "edited"],
    });
    const note = await core.approveInboxItem(added.item.id);
    const raw = await host.readFile(note.vaultPath);

    expect(note.title).toBe("Edited Preview Title");
    expect(note.summary).toBe("Edited preview summary");
    expect(note.tags).toEqual(["edited", "preview"]);
    expect(raw).toContain("title: Edited Preview Title");
    expect(raw).toContain("aether_summary: Edited preview summary");
    expect(await core.search({ query: "Edited Preview Title" })).toHaveLength(1);
  });

  it("deletes an approved note, its file, and index rows", async () => {
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
    expect(await host.exists(note.vaultPath)).toBe(true);
    expect(core.store.getNote(note.id)).toBeDefined();
    expect(core.store.allChunks().some((c) => c.noteId === note.id)).toBe(true);

    await core.deleteNote(note.id);

    expect(await host.exists(note.vaultPath)).toBe(false);
    expect(core.store.getNote(note.id)).toBeUndefined();
    expect(core.store.allChunks().some((c) => c.noteId === note.id)).toBe(false);
    const hits = await core.search({ query: "Hello notes" });
    expect(hits.find((h) => h.noteId === note.id)).toBeUndefined();
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

  it("writes only selected items from a parsed batch", async () => {
    const { host, core } = await bootstrap();
    const events = await collect(
      core.importSource({
        kind: "file",
        label: "batch",
        payload: {
          type: "markdown-files",
          files: [
            { path: "keep.md", content: "# Keep\n\nAlpha selected content" },
            { path: "skip.md", content: "# Skip\n\nBeta discarded content" },
          ],
        },
      }),
    );
    const added = events.filter(
      (e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added",
    );
    expect(added).toHaveLength(2);

    const keep = added.find((e) => e.item.sourceRef === "keep.md")?.item;
    const skip = added.find((e) => e.item.sourceRef === "skip.md")?.item;
    expect(keep).toBeDefined();
    expect(skip).toBeDefined();
    if (!keep || !skip) throw new Error("missing parsed items");

    await core.approveInboxItem(keep.id);
    await core.discardInboxItem(skip.id);

    expect(core.inbox.getItem(keep.id)?.status).toBe("approved");
    expect(core.inbox.getItem(skip.id)?.status).toBe("discarded");
    expect(await host.listMarkdown("")).toHaveLength(1);
    expect(core.store.allNotes()).toHaveLength(1);
    expect(core.store.allNotes()[0]?.sourceMeta.originalSourceRef).toBe("keep.md");

    const keptHits = await core.search({ query: "Alpha selected" });
    expect(keptHits.length).toBeGreaterThan(0);
  });
});
