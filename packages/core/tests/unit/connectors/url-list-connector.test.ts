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

  it("emits one bookmark per non-empty URL", async () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: { type: "url-list", urls: ["https://a.com", "https://b.com", "", "  "] },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(2);
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
