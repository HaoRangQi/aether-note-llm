import { describe, expect, it } from "vitest";
import { ITabConnector } from "../../../src/connectors/itab-connector.js";
import type { ImportSource } from "../../../src/types.js";

const SAMPLE: object = {
  navConfig: [
    {
      id: "1",
      name: "工作",
      children: [
        { id: "a", name: "GitHub", type: "link", url: "https://github.com/" },
        { id: "b", name: "内部工具", type: "link", url: "https://internal.example.com/" },
        { id: "c", name: "chrome内部", type: "link", url: "chrome://extensions/" },
        {
          id: "d",
          name: "子文件夹",
          type: "folder",
          children: [{ id: "e", name: "Nested", type: "link", url: "https://nested.example.com/" }],
        },
      ],
    },
  ],
  notes: [
    { id: "n1", title: "我的笔记", content: "内容在这里", ct: 1700000000000 },
    { id: "n2", title: "", content: "", ct: 0 },
  ],
};

function makeSource(raw: string): ImportSource {
  return { kind: "file", label: "test.itabdata", payload: { type: "itab-data", raw } };
}

async function collect(source: ImportSource) {
  const connector = new ITabConnector();
  const out = [];
  for await (const c of connector.parse(source)) out.push(c);
  return out;
}

describe("ITabConnector", () => {
  it("canHandle itab-data source", () => {
    const c = new ITabConnector();
    expect(c.canHandle(makeSource("{}"))).toBe(true);
    expect(
      c.canHandle({ kind: "paste", label: "x", payload: { type: "paste-text", text: "" } }),
    ).toBe(false);
  });

  it("extracts http bookmarks, skips chrome:// links", async () => {
    const items = await collect(makeSource(JSON.stringify(SAMPLE)));
    const bookmarks = items.filter((i) => i.kind === "bookmark");
    expect(bookmarks.length).toBe(3); // github, internal, nested — not chrome://
    expect(bookmarks.map((b) => b.url)).toContain("https://github.com/");
    expect(bookmarks.map((b) => b.url)).not.toContain("chrome://extensions/");
  });

  it("assigns page name as tag", async () => {
    const items = await collect(makeSource(JSON.stringify(SAMPLE)));
    const gh = items.find((i) => i.url === "https://github.com/");
    expect(gh?.tags).toContain("工作");
  });

  it("nested bookmark gets folder path in tags", async () => {
    const items = await collect(makeSource(JSON.stringify(SAMPLE)));
    const nested = items.find((i) => i.url === "https://nested.example.com/");
    expect(nested?.tags).toContain("工作");
    expect(nested?.tags).toContain("子文件夹");
  });

  it("imports notes, skips empty ones", async () => {
    const items = await collect(makeSource(JSON.stringify(SAMPLE)));
    const notes = items.filter((i) => i.kind === "note");
    expect(notes.length).toBe(1);
    expect(notes[0]?.title).toBe("我的笔记");
    expect(notes[0]?.content).toBe("内容在这里");
  });

  it("deduplicates same URL across pages", async () => {
    const data = {
      navConfig: [
        { name: "A", children: [{ type: "link", url: "https://dup.example.com/", name: "Dup" }] },
        { name: "B", children: [{ type: "link", url: "https://dup.example.com/", name: "Dup2" }] },
      ],
    };
    const items = await collect(makeSource(JSON.stringify(data)));
    expect(items.filter((i) => i.url === "https://dup.example.com/").length).toBe(1);
  });

  it("returns nothing for invalid JSON", async () => {
    const items = await collect(makeSource("not json"));
    expect(items).toHaveLength(0);
  });
});
