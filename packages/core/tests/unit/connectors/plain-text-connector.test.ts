import { describe, expect, it } from "vitest";
import { PlainTextConnector } from "../../../src/connectors/plain-text-connector.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("PlainTextConnector", () => {
  const c = new PlainTextConnector();

  it("canHandle paste-text", () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: { type: "paste-text", text: "hi" },
    };
    expect(c.canHandle(s)).toBe(true);
  });

  it("emits one candidate with null title", async () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: { type: "paste-text", text: "Hello" },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(1);
    expect(r[0]?.title).toBeNull();
    expect(r[0]?.content).toBe("Hello");
  });

  it("emits nothing for whitespace-only text", async () => {
    const s: ImportSource = {
      kind: "paste",
      label: "x",
      payload: { type: "paste-text", text: "   " },
    };
    const r = await collect(c.parse(s));
    expect(r).toEqual([]);
  });
});
