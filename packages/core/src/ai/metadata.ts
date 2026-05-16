import type { ProviderRegistry } from "../provider/registry.js";
import type { RawCandidate } from "../types.js";

export interface MetadataProposal {
  title: string;
  tags: string[];
  summary: string;
}

const SYSTEM_PROMPT = `You are an AI metadata assistant for a personal knowledge base.
Given a markdown note, propose:
- title: <=80 chars, descriptive, no quotes
- tags: <=5 lowercase short tags (single words or hyphenated)
- summary: <=160 chars, one sentence, no bullet points

Return ONLY a single JSON object with keys "title", "tags", "summary". No commentary.`;

export async function proposeMetadata(args: {
  registry: ProviderRegistry;
  candidate: RawCandidate;
  fallbackTitle: string;
  signal?: AbortSignal;
}): Promise<MetadataProposal> {
  const { registry, candidate, fallbackTitle } = args;
  let resolved;
  try {
    resolved = registry.resolve("inbox_metadata");
  } catch {
    return fallbackProposal(candidate, fallbackTitle);
  }
  const { provider, model, binding } = resolved;
  const userPrompt = buildUserPrompt(candidate);
  try {
    let raw = "";
    const chatReq: Parameters<typeof provider.chat>[0] = {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      model,
      stream: true,
      temperature: binding.params.temperature ?? 0.2,
    };
    if (args.signal) chatReq.signal = args.signal;
    for await (const c of provider.chat(chatReq)) {
      raw += c.delta;
    }
    return parseProposal(raw) ?? fallbackProposal(candidate, fallbackTitle);
  } catch {
    return fallbackProposal(candidate, fallbackTitle);
  }
}

function buildUserPrompt(c: RawCandidate): string {
  const body = c.content.slice(0, 4000);
  return `Source path: ${c.sourceRef}\nKind: ${c.kind}\n${c.url ? `URL: ${c.url}\n` : ""}\n--- BEGIN CONTENT ---\n${body}\n--- END CONTENT ---`;
}

export function parseProposal(raw: string): MetadataProposal | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]) as Partial<MetadataProposal>;
    if (typeof j.title !== "string") return null;
    const tags = Array.isArray(j.tags)
      ? j.tags.filter((t): t is string => typeof t === "string").slice(0, 5)
      : [];
    return {
      title: j.title.trim().slice(0, 80),
      tags,
      summary: typeof j.summary === "string" ? j.summary.trim().slice(0, 160) : "",
    };
  } catch {
    return null;
  }
}

function fallbackProposal(c: RawCandidate, fallbackTitle: string): MetadataProposal {
  const firstLine = c.content.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const title = c.title ?? (firstLine.length > 0 ? firstLine.slice(0, 80) : fallbackTitle);
  return { title, tags: c.tags, summary: "" };
}
