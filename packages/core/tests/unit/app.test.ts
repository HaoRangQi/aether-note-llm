import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";

describe("AetherCore", () => {
  it("init loads defaults when no settings present", async () => {
    const host = new InMemoryHostAdapter({
      now: () => 1,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    expect(core.settings.current.providers).toEqual([]);
    expect(core.settings.current.ui.alpha).toBe(0.4);
  });

  it("indexExistingVaultFile reads markdown + indexes", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID\ntitle: My Note\n---\nbody about cats",
      },
      now: () => 100,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    const note = await core.indexExistingVaultFile("notes/a.md");
    expect(note?.id).toBe("01ID");
    expect(note?.title).toBe("My Note");
  });

  it("rebuildAll scans configured scope", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/a.md": "# A\nbody",
        "Aether Inbox/notes/b.md": "# B\nbody",
        "Other/c.md": "# C\nbody",
      },
      now: () => 100,
      newId: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });
    const core = new AetherCore(host);
    await core.init();
    await core.settings.save({
      ...core.settings.current,
      ui: { ...core.settings.current.ui, scanScope: "aether-inbox-only" },
    });
    const r = await core.rebuildAll();
    expect(r.indexed).toBe(2);
  });
});
