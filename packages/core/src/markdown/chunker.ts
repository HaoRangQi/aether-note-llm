const MAX_CHARS = 1600;
const MIN_CHARS = 80;

export interface ChunkInput {
  ordinal: number;
  headingPath: string;
  content: string;
  approxTokens: number;
}

interface Section {
  headingPath: string;
  text: string;
}

function approxTokens(s: string): number {
  // Rough heuristic: 1 token ≈ 2.5 chars (compromise between English and Chinese).
  // Used only for budget previews — never for billing.
  return Math.ceil(s.length / 2.5);
}

/**
 * Append chunks from a single section into `out`, splitting at paragraph
 * boundaries when the section exceeds MAX_CHARS. Mutates `out` and returns
 * the next ordinal to use.
 */
function pushSplitParts(
  out: ChunkInput[],
  section: Section,
  ordinalStart: number,
): number {
  let ord = ordinalStart;
  const paragraphs = section.text.split(/\n{2,}/);
  let buf = "";
  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed.length === 0) return;
    out.push({
      ordinal: ord++,
      headingPath: section.headingPath,
      content: trimmed,
      approxTokens: approxTokens(trimmed),
    });
    buf = "";
  };
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > MAX_CHARS && buf.length >= MIN_CHARS) {
      flush();
    }
    buf = buf.length === 0 ? p : `${buf}\n\n${p}`;
    if (buf.length >= MAX_CHARS) flush();
  }
  flush();
  return ord;
}

/** Chunk a markdown body, heading-aware. Empty body → empty list. */
export function chunkMarkdown(body: string): ChunkInput[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let path: string[] = [];
  let current: Section = { headingPath: "", text: "" };

  const flushSection = () => {
    if (current.text.trim().length > 0) sections.push({ ...current });
    current = { headingPath: path.join(" > "), text: "" };
  };

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && h[1] && h[2] !== undefined) {
      flushSection();
      const depth = h[1].length;
      const text = h[2].trim();
      path = path.slice(0, depth - 1);
      path[depth - 1] = text;
      path = path.filter((s): s is string => typeof s === "string");
      current = { headingPath: path.join(" > "), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  flushSection();

  if (sections.length === 0) return chunkPlain(body);

  const out: ChunkInput[] = [];
  let nextOrdinal = 0;
  for (const s of sections) {
    nextOrdinal = pushSplitParts(out, s, nextOrdinal);
  }
  return out;
}

/** Chunk plain text (no heading awareness). Empty input → empty list. */
export function chunkPlain(body: string): ChunkInput[] {
  const out: ChunkInput[] = [];
  pushSplitParts(out, { headingPath: "", text: body }, 0);
  return out;
}
