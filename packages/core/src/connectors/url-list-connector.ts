import { normalizeUrl } from "../url-normalize.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

export class UrlListConnector implements SourceConnector {
  readonly id = "url-list";
  readonly name = "URL list (paste)";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "url-list";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "url-list") return;
    const seen = new Set<string>();
    for (const raw of source.payload.urls) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const normalized = normalizeUrl(trimmed);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      yield {
        title: null,
        content: "",
        tags: [],
        url: trimmed,
        kind: "bookmark",
        assets: [],
        sourceRef: normalized,
        sourceMeta: { connector: "url-list" },
      };
    }
  }
}
