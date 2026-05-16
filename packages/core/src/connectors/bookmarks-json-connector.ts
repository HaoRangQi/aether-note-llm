import { normalizeUrl } from "../url-normalize.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

interface ChromeNode {
  type?: string;
  url?: string;
  name?: string;
  children?: ChromeNode[];
  date_added?: string;
}

interface ChromeBookmarksFile {
  roots?: Record<string, ChromeNode>;
}

export class BookmarksJsonConnector implements SourceConnector {
  readonly id = "bookmarks-json";
  readonly name = "Chrome / Edge bookmarks JSON";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "bookmarks-json";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "bookmarks-json") return;
    let parsed: ChromeBookmarksFile;
    try {
      parsed = JSON.parse(source.payload.raw) as ChromeBookmarksFile;
    } catch {
      return;
    }
    const seen = new Set<string>();
    for (const [rootKey, root] of Object.entries(parsed.roots ?? {})) {
      yield* walk(root, [rootKey], seen);
    }
  }
}

async function* walk(
  node: ChromeNode,
  path: string[],
  seen: Set<string>,
): AsyncIterable<RawCandidate> {
  if (node.type === "url" && node.url) {
    const normalized = normalizeUrl(node.url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    yield {
      title: node.name ?? null,
      content: "",
      tags: [],
      url: node.url,
      kind: "bookmark",
      assets: [],
      sourceRef: normalized,
      sourceMeta: {
        folderPath: path.join("/"),
        chromeDateAdded: node.date_added ?? null,
      },
    };
    return;
  }
  if (node.children) {
    const nextPath = node.name ? [...path, node.name] : path;
    for (const child of node.children) {
      yield* walk(child, nextPath, seen);
    }
  }
}
