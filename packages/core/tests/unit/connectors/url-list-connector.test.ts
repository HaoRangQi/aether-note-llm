import { describe, expect, it } from "vitest";
import { UrlListConnector } from "../../../src/connectors/url-list-connector.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("UrlListConnector", () => {
  const c = new UrlListConnector();

  it("skips blank lines and obvious non-URLs", async () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: {
        type: "url-list",
        urls: ["https://a.com", "", "  ", "not a url", "example.com", "mailto:test@example.com"],
      },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(1);
    expect(r[0]?.url).toBe("https://a.com");
    expect(r[0]?.kind).toBe("bookmark");
  });

  it("keeps valid http and https URLs", async () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: { type: "url-list", urls: ["http://a.com", "https://b.com"] },
    };
    const r = await collect(c.parse(s));
    expect(r.map((x) => x.url)).toEqual(["http://a.com", "https://b.com"]);
    expect(r.every((x) => x.kind === "bookmark")).toBe(true);
  });

  it("dedupes after normalize", async () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: {
        type: "url-list",
        urls: ["https://x.com/a", "https://x.com/a?utm_source=foo"],
      },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(1);
  });
});
