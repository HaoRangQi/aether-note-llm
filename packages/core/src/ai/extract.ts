import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import { runRole } from "../roles/run-role.js";

export async function extractKeyPoints(args: {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  selection: string;
  maxPoints?: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const max = args.maxPoints ?? 5;
  const opts: Parameters<typeof runRole>[0] = {
    registry: args.registry,
    roles: args.roles,
    roleId: "extract",
    vars: { selection: args.selection, maxPoints: max },
  };
  if (args.signal) opts.signal = args.signal;
  const r = await runRole(opts);
  if (Array.isArray(r.output)) {
    return (r.output as string[]).slice(0, max);
  }
  // text 兜底
  return String(r.output ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0)
    .slice(0, max);
}
