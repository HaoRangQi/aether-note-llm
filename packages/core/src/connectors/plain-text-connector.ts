import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

export class PlainTextConnector implements SourceConnector {
  readonly id = "plain-text";
  readonly name = "Pasted text";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "paste-text";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "paste-text") return;
    const text = source.payload.text.trim();
    if (text.length === 0) return;
    yield {
      title: null,
      content: text,
      tags: [],
      url: null,
      kind: "note",
      assets: [],
      sourceRef: `paste:${source.label}`,
      sourceMeta: { label: source.label },
    };
  }
}
