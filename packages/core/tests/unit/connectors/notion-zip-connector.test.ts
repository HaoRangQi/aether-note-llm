import { describe, expect, it } from "vitest";
import { NotionZipConnector } from "../../../src/connectors/notion-zip-connector.js";
import { NOTION_FIXTURE } from "../../fixtures/notion-entries.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("NotionZipConnector", () => {
  const c = new NotionZipConnector();
  const src: ImportSource = {
    kind: "file",
    label: "notion.zip",
    payload: { type: "notion-zip", entries: NOTION_FIXTURE },
  };

  it("skips non-markdown entries", async () => {
    const r = await collect(c.parse(src));
    expect(r.every((x) => !x.sourceRef.endsWith(".png"))).toBe(true);
  });

  it("strips Notion 32-hex id suffix from titles", async () => {
    const r = await collect(c.parse(src));
    const titles = r.map((x) => x.title);
    expect(titles).toContain("Project Plan");
    expect(titles).toContain("Inbox");
  });

  it("uses frontmatter title when present", async () => {
    const r = await collect(c.parse(src));
    expect(r.find((x) => x.title === "Project Plan")?.tags).toEqual(["planning"]);
  });

  it("emits one candidate per markdown entry", async () => {
    const r = await collect(c.parse(src));
    expect(r).toHaveLength(2);
  });
});
