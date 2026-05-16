import { runFeature } from "./rewrite.js";
import type { ProviderRegistry } from "../provider/registry.js";

export async function extractKeyPoints(args: {
  registry: ProviderRegistry;
  selection: string;
  maxPoints?: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const max = args.maxPoints ?? 5;
  const systemPrompt = `You extract the key points from a markdown passage. Return at most ${max} short bullet lines, each starting with "- ". Return ONLY the bullets — no headings, no preamble.`;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    feature: "extract",
    systemPrompt,
    userPrompt: args.selection,
  };
  if (args.signal) opts.signal = args.signal;
  const raw = await runFeature(opts);
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0)
    .slice(0, max);
}
