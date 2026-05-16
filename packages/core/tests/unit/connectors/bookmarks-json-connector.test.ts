import { describe, expect, it } from "vitest";
import { BookmarksJsonConnector } from "../../../src/connectors/bookmarks-json-connector.js";
import { CHROME_FIXTURE } from "../../fixtures/chrome-bookmarks.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("BookmarksJsonConnector", () => {
  const c = new BookmarksJsonConnector();
  const src: ImportSource = {
    kind: "file",
    label: "chrome.json",
    payload: { type: "bookmarks-json", raw: JSON.stringify(CHROME_FIXTURE) },
  };

  it("flattens folder hierarchy into candidates", async () => {
    const r = await collect(c.parse(src));
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves original url in candidate.url", async () => {
    const r = await collect(c.parse(src));
    expect(r.find((x) => x.url?.startsWith("https://obsidian.md"))).toBeTruthy();
  });

  it("dedupes URLs after normalisation", async () => {
    const r = await collect(c.parse(src));
    const urls = r.map((x) => x.sourceRef);
    const uniq = new Set(urls);
    expect(uniq.size).toBe(urls.length);
  });

  it("records folder path in sourceMeta", async () => {
    const r = await collect(c.parse(src));
    const article = r.find((x) => x.url?.includes("/article"));
    expect((article?.sourceMeta as { folderPath?: string }).folderPath).toContain("Learning");
  });

  it("emits all entries as kind: bookmark", async () => {
    const r = await collect(c.parse(src));
    expect(r.every((x) => x.kind === "bookmark")).toBe(true);
  });

  it("silently ignores invalid JSON", async () => {
    const bad: ImportSource = {
      kind: "file",
      label: "x",
      payload: { type: "bookmarks-json", raw: "not json" },
    };
    const r = await collect(c.parse(bad));
    expect(r).toEqual([]);
  });
});
