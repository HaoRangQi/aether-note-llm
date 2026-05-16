import { parseDocument } from "../markdown/frontmatter.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

const NOTION_ID_RE = /\s+[0-9a-f]{32}(?:\.md)?$/i;

export class NotionZipConnector implements SourceConnector {
  readonly id = "notion-zip";
  readonly name = "Notion export";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "notion-zip";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "notion-zip") return;
    for (const e of source.payload.entries) {
      if (!e.path.toLowerCase().endsWith(".md")) continue;
      const parsed = parseDocument(e.content);
      const title = (() => {
        const t =
          typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title.trim() : "";
        if (t) return t;
        const base = (e.path.split("/").pop() ?? e.path).replace(/\.md$/i, "");
        return base.replace(NOTION_ID_RE, "").trim();
      })();
      const tags = Array.isArray(parsed.frontmatter.tags)
        ? parsed.frontmatter.tags.filter((t): t is string => typeof t === "string")
        : [];
      yield {
        title,
        content: parsed.body.trim(),
        tags,
        url: null,
        kind: "note",
        assets: [],
        sourceRef: e.path,
        sourceMeta: { connector: "notion-zip", originalPath: e.path },
      };
    }
  }
}
