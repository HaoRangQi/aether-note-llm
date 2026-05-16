import matter from "gray-matter";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type { NoteKind, NoteSource } from "../types.js";

/** Strongly-typed Aether frontmatter view. Unknown keys are preserved. */
export interface AetherFrontmatter {
  aether_id?: string;
  aether_kind?: NoteKind;
  title?: string;
  tags?: string[];
  aether_summary?: string | null;
  aether_source?: NoteSource;
  aether_url?: string | null;
  aether_created?: number;
  aether_updated?: number;
  [extra: string]: unknown;
}

export interface ParsedDocument {
  frontmatter: AetherFrontmatter;
  body: string;
  /** True when the file had frontmatter that failed to parse. Body is then the raw file (delimiters stripped if possible). */
  malformed: boolean;
}

const DELIM = "---";

export function parseDocument(raw: string): ParsedDocument {
  if (!raw.startsWith(DELIM)) {
    return { frontmatter: {}, body: raw, malformed: false };
  }
  try {
    const m = matter(raw, {
      engines: {
        yaml: {
          parse: yamlParse as never,
          stringify: yamlStringify as never,
        },
      },
    });
    const fm = (m.data ?? {}) as AetherFrontmatter;
    return { frontmatter: fm, body: m.content, malformed: false };
  } catch {
    // gray-matter throws on invalid YAML; strip the broken frontmatter so callers still get body.
    const lines = raw.split("\n");
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === DELIM) {
        end = i;
        break;
      }
    }
    if (end === -1) {
      return { frontmatter: {}, body: raw, malformed: true };
    }
    return { frontmatter: {}, body: lines.slice(end + 1).join("\n"), malformed: true };
  }
}

export function serializeDocument(fm: AetherFrontmatter, body: string): string {
  const ordered: Record<string, unknown> = {};
  const known = [
    "aether_id",
    "aether_kind",
    "title",
    "tags",
    "aether_summary",
    "aether_source",
    "aether_url",
    "aether_created",
    "aether_updated",
  ];
  for (const k of known) {
    if (fm[k] !== undefined) ordered[k] = fm[k];
  }
  for (const [k, v] of Object.entries(fm)) {
    if (!known.includes(k)) ordered[k] = v;
  }
  if (Object.keys(ordered).length === 0) return body;
  const yaml = yamlStringify(ordered).trimEnd();
  const bodyPart = body.startsWith("\n") ? body : `\n${body}`;
  return `${DELIM}\n${yaml}\n${DELIM}${bodyPart}`;
}

/** Derive a display title using fallback chain: frontmatter.title → first H1 → filename stem. */
export function deriveTitle(parsed: ParsedDocument, vaultPath: string): string {
  const fmTitle =
    typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title.trim() : "";
  if (fmTitle) return fmTitle;
  const h1 = /^#\s+(.+)$/m.exec(parsed.body);
  if (h1 && h1[1]) return h1[1].trim();
  const base = vaultPath.split("/").pop() ?? vaultPath;
  return base.replace(/\.md$/i, "");
}
