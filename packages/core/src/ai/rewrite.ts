import type { Feature } from "../types.js";
import type { ProviderRegistry } from "../provider/registry.js";

export async function runFeature(args: {
  registry: ProviderRegistry;
  feature: Feature;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { registry, feature, systemPrompt, userPrompt } = args;
  const { provider, model, binding } = registry.resolve(feature);
  let out = "";
  const chatReq: Parameters<typeof provider.chat>[0] = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model,
    stream: true,
    temperature: binding.params.temperature ?? 0.4,
  };
  if (args.signal) chatReq.signal = args.signal;
  for await (const c of provider.chat(chatReq)) {
    out += c.delta;
  }
  return out.trim();
}

export async function rewriteSelection(args: {
  registry: ProviderRegistry;
  selection: string;
  style?: "concise" | "polished" | "neutral";
  signal?: AbortSignal;
}): Promise<string> {
  const style = args.style ?? "neutral";
  const systemPrompt = `You rewrite a markdown passage to be ${style}. Preserve the user's intent. Return ONLY the rewritten passage — no commentary, no quoting.`;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    feature: "rewrite",
    systemPrompt,
    userPrompt: args.selection,
  };
  if (args.signal) opts.signal = args.signal;
  return runFeature(opts);
}
