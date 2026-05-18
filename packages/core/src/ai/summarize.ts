import { runFeature } from "./rewrite.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";

export async function summarizeSelection(args: {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  selection: string;
  maxSentences?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const sent = args.maxSentences ?? 3;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    roles: args.roles,
    roleId: "summarize",
    vars: { selection: args.selection, maxSentences: sent },
  };
  if (args.signal) opts.signal = args.signal;
  return runFeature(opts);
}
