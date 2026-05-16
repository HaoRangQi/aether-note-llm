import { describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";

describe("InMemoryHostAdapter", () => {
  it("seeded files are readable", async () => {
    const h = new InMemoryHostAdapter({ files: { "a.md": "hello" } });
    expect(await h.readFile("a.md")).toBe("hello");
    expect(await h.exists("a.md")).toBe(true);
  });

  it("write then read round-trip", async () => {
    const h = new InMemoryHostAdapter();
    await h.writeFile("b.md", "world");
    expect(await h.readFile("b.md")).toBe("world");
  });

  it("listMarkdown filters by prefix and extension", async () => {
    const h = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/x.md": "x",
        "Aether Inbox/notes/y.md": "y",
        "Other/z.md": "z",
        "image.png": "binary",
      },
    });
    const list = await h.listMarkdown("Aether Inbox/notes");
    expect(list.map((f) => f.path)).toEqual([
      "Aether Inbox/notes/x.md",
      "Aether Inbox/notes/y.md",
    ]);
  });

  it("notify records notices", () => {
    const h = new InMemoryHostAdapter();
    h.notify("hi", { level: "warn" });
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0]?.options?.level).toBe("warn");
  });

  it("openExternal records url", async () => {
    const h = new InMemoryHostAdapter();
    await h.openExternal("https://example.com");
    expect(h.opened).toEqual(["https://example.com"]);
  });

  it("readData returns null when missing", async () => {
    const h = new InMemoryHostAdapter();
    expect(await h.readData("missing")).toBeNull();
  });

  it("fetch stub is invoked when provided", async () => {
    const h = new InMemoryHostAdapter({
      fetch: async () => new Response("ok", { status: 200 }),
    });
    const r = await h.fetch("https://x");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("now & newId honour overrides", () => {
    const h = new InMemoryHostAdapter({ now: () => 42, newId: () => "fixed" });
    expect(h.now()).toBe(42);
    expect(h.newId()).toBe("fixed");
  });

  it("deleteFile removes entry", async () => {
    const h = new InMemoryHostAdapter({ files: { "a.md": "x" } });
    await h.deleteFile("a.md");
    expect(await h.exists("a.md")).toBe(false);
  });
});
