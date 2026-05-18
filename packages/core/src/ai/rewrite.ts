import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import { runRole } from "../roles/run-role.js";

/**
 * 通用调用 wrapper —— 仅用于内部三个内置 text/list 角色（summarize/rewrite/extract）。
 * 使用其他 role 请直接调 `runRole`。
 *
 * 接受 systemPrompt 参数是 v0.1 兼容残留：v0.2 起 prompt 在 Role 模板里，systemPrompt 实际未被使用。
 */
export async function runFeature(args: {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  roleId: "summarize" | "rewrite" | "extract";
  vars: Record<string, string | number>;
  signal?: AbortSignal;
}): Promise<string> {
  const opts: Parameters<typeof runRole>[0] = {
    registry: args.registry,
    roles: args.roles,
    roleId: args.roleId,
    vars: args.vars,
  };
  if (args.signal) opts.signal = args.signal;
  const result = await runRole(opts);
  if (typeof result.output === "string") return result.output;
  if (Array.isArray(result.output)) {
    return (result.output as string[]).map((p) => `- ${p}`).join("\n");
  }
  return result.raw.trim();
}

export async function rewriteSelection(args: {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  selection: string;
  style?: "concise" | "polished" | "neutral" | string;
  signal?: AbortSignal;
}): Promise<string> {
  const styleMap: Record<string, string> = {
    concise: "更精炼",
    polished: "更顺畅、专业",
    neutral: "更通顺自然",
  };
  const style =
    typeof args.style === "string" && styleMap[args.style]
      ? styleMap[args.style]
      : (args.style ?? "更通顺自然");
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    roles: args.roles,
    roleId: "rewrite",
    vars: { selection: args.selection, style },
  };
  if (args.signal) opts.signal = args.signal;
  return runFeature(opts);
}
