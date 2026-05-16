import { parseDocument, deriveTitle } from "../markdown/frontmatter.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

export class MarkdownConnector implements SourceConnector {
  readonly id = "markdown";
  readonly name = "Markdown file(s)";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "markdown-file" || source.payload.type === "markdown-files";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    const items =
      source.payload.type === "markdown-file"
        ? [{ path: source.payload.path, content: source.payload.content }]
        : source.payload.type === "markdown-files"
          ? source.payload.files
          : [];
    for (const item of items) {
      const parsed = parseDocument(item.content);
      const title = deriveTitle(parsed, item.path);
      const tags = Array.isArray(parsed.frontmatter.tags)
        ? parsed.frontmatter.tags.filter((t): t is string => typeof t === "string")
        : [];
      const url =
        typeof parsed.frontmatter["aether_url"] === "string"
          ? (parsed.frontmatter["aether_url"] as string)
          : null;
      yield {
        title,
        content: parsed.body.trim(),
        tags,
        url,
        kind: parsed.frontmatter.aether_kind === "bookmark" ? "bookmark" : "note",
        assets: [],
        sourceRef: item.path,
        sourceMeta: { originalPath: item.path, malformed: parsed.malformed },
      };
    }
  }
}
