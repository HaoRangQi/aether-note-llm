import { runFeature } from "./rewrite.js";
import type { ProviderRegistry } from "../provider/registry.js";

export async function summarizeSelection(args: {
  registry: ProviderRegistry;
  selection: string;
  maxSentences?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const sent = args.maxSentences ?? 3;
  const systemPrompt = `You summarise a markdown passage in at most ${sent} sentences. Return ONLY the summary — no headings, no preamble, no quoting.`;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    feature: "summarize",
    systemPrompt,
    userPrompt: args.selection,
  };
  if (args.signal) opts.signal = args.signal;
  return runFeature(opts);
}
