import { describe, expect, it } from "vitest";
import { MarkdownConnector } from "../../../src/connectors/markdown-connector.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("MarkdownConnector", () => {
  const c = new MarkdownConnector();

  it("canHandle markdown-file", () => {
    const s: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "" },
    };
    expect(c.canHandle(s)).toBe(true);
  });

  it("extracts title from frontmatter when present", async () => {
    const s: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: {
        type: "markdown-file",
        path: "a.md",
        content: "---\ntitle: Hello\ntags: [x, y]\n---\nBody",
      },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.title).toBe("Hello");
    expect(r[0]?.tags).toEqual(["x", "y"]);
    expect(r[0]?.content).toBe("Body");
  });

  it("falls back to H1 when no frontmatter title", async () => {
    const s: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "# Heading\ntext" },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.title).toBe("Heading");
  });

  it("marks bookmark when aether_kind=bookmark", async () => {
    const s: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: {
        type: "markdown-file",
        path: "a.md",
        content: "---\naether_kind: bookmark\naether_url: https://x\n---\n",
      },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.kind).toBe("bookmark");
    expect(r[0]?.url).toBe("https://x");
  });

  it("emits one candidate per file in markdown-files", async () => {
    const s: ImportSource = {
      kind: "file",
      label: "batch",
      payload: {
        type: "markdown-files",
        files: [
          { path: "a.md", content: "A" },
          { path: "b.md", content: "B" },
        ],
      },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.sourceRef)).toEqual(["a.md", "b.md"]);
  });

  it("flags malformed frontmatter in sourceMeta", async () => {
    const s: ImportSource = {
      kind: "file",
      label: "a.md",
      payload: {
        type: "markdown-file",
        path: "a.md",
        content: "---\ntitle: [unclosed\n---\nBody",
      },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.sourceMeta["malformed"]).toBe(true);
  });
});
