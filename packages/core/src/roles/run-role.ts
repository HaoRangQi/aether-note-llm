import { AetherError } from "../errors.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { AiRole, TokenUsage } from "../types.js";
import { findMissingPromptVariables, renderPrompt } from "./render-prompt.js";
import type { RoleRegistry } from "./role-registry.js";

export interface RunRoleArgs {
  roles: RoleRegistry;
  registry: ProviderRegistry;
  roleId: string;
  /** 模板渲染变量 */
  vars: Record<string, string | number>;
  /** 临时覆盖 provider/model（用于私密目录路由）。 */
  providerOverride?: {
    providerId: string;
    modelName: string;
  };
  /** 用户级覆盖参数（temperature 等），优先级高于 role.params */
  overrideParams?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface RunRoleResult {
  role: AiRole;
  /** 解析后的输出（按 outputKind 不同类型不同） */
  output: unknown;
  /** 原始返回（用于调试 / aiTrace） */
  raw: string;
  usage?: TokenUsage;
}

/**
 * AI 调用唯一入口。按 outputKind 分流：
 *   - text     → 拼装 system + user → chat 流式 → 字符串
 *   - list     → 同上，结果按 "- " 行拆成数组
 *   - metadata → 同上，结果按 JSON 解析（失败抛 AetherError）
 *   - embedding→ 不做 chat，调 embed；vars.input 是文本
 *
 * 上层 wrapper（summarizeSelection 等）只是组装 vars 后再调本函数。
 */
export async function runRole(args: RunRoleArgs): Promise<RunRoleResult> {
  const baseRole = args.roles.resolve(args.roleId);
  const role = args.providerOverride
    ? {
        ...baseRole,
        providerId: args.providerOverride.providerId,
        modelName: args.providerOverride.modelName,
      }
    : baseRole;

  if (role.outputKind === "embedding") {
    return runEmbedding(args, role);
  }

  const params = { ...role.params, ...(args.overrideParams ?? {}) };
  const promptVars = { ...params, ...args.vars } as Record<string, string | number>;
  const missingVars = findMissingPromptVariables(role.promptTemplate, promptVars);
  if (missingVars.length > 0) {
    throw new AetherError(
      "PARSE_ERROR",
      `Prompt template for role ${role.id} references missing variable(s): ${missingVars.join(", ")}`,
    );
  }
  const userPrompt = renderPrompt(role.promptTemplate, promptVars).trim();
  if (!userPrompt) {
    throw new AetherError("PARSE_ERROR", `Prompt rendered empty for role: ${role.id}`);
  }

  const provider = args.registry.getProvider(role.providerId);
  let raw = "";
  let usage: TokenUsage | undefined;
  const chatReq: Parameters<typeof provider.chat>[0] = {
    messages: [{ role: "user", content: userPrompt }],
    model: role.modelName,
    stream: true,
    temperature: normalizeTemperature(params.temperature) ?? 0.4,
  };
  const maxTokens = normalizeMaxTokens(params.maxTokens);
  if (maxTokens !== undefined) chatReq.maxTokens = maxTokens;
  if (args.signal) chatReq.signal = args.signal;

  for await (const c of provider.chat(chatReq)) {
    raw += c.delta;
    if (c.usage) usage = sumUsage(usage, c.usage);
  }
  const text = raw.trim();

  let output: unknown;
  switch (role.outputKind) {
    case "text":
      output = text;
      break;
    case "list":
      output = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2).trim())
        .filter((l) => l.length > 0);
      break;
    case "metadata":
      output = parseJsonObject(text);
      break;
    default:
      output = text;
  }

  return { role, output, raw, ...(usage ? { usage } : {}) };
}

async function runEmbedding(args: RunRoleArgs, role: AiRole): Promise<RunRoleResult> {
  const input = args.vars.input;
  if (typeof input !== "string" || input.length === 0) {
    throw new AetherError("PARSE_ERROR", "embedding role requires vars.input string");
  }
  const provider = args.registry.getProvider(role.providerId);
  const req: Parameters<typeof provider.embed>[0] = {
    inputs: [input],
    model: role.modelName,
  };
  if (args.signal) req.signal = args.signal;
  const r = await provider.embed(req);
  return { role, output: r.vectors[0] ?? [], raw: "", ...(r.usage ? { usage: r.usage } : {}) };
}

function sumUsage(a: TokenUsage | undefined, b: TokenUsage): TokenUsage {
  return {
    promptTokens: (a?.promptTokens ?? 0) + b.promptTokens,
    completionTokens: (a?.completionTokens ?? 0) + b.completionTokens,
  };
}

function normalizeTemperature(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2
    ? value
    : undefined;
}

function normalizeMaxTokens(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function parseJsonObject(raw: string): unknown {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
