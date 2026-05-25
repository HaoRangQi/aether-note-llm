import type {
  AiRole,
  Feature,
  FeatureBinding,
  PersistedSettings,
  ProviderConfig,
} from "../types.js";
import { findPresetByBaseUrl } from "../provider/presets.js";
import { BUILTIN_ROLE_SEEDS, seedToRole, type BuiltInRoleId } from "../roles/default-roles.js";

export const SETTINGS_LATEST_VERSION = 2 as const;

interface RawSettings {
  schemaVersion?: number;
  providers?: ProviderConfig[];
  bindings?: FeatureBinding[];
  roles?: AiRole[];
  apiKeys?: Record<string, string>;
  ui?: Partial<PersistedSettings["ui"]>;
  budgets?: Partial<PersistedSettings["budgets"]>;
  flags?: Partial<PersistedSettings["flags"]>;
}

export function migrateSettings(raw: unknown): PersistedSettings {
  const obj = (raw ?? {}) as RawSettings;
  const version = obj.schemaVersion ?? 1;

  if (version !== 1 && version !== 2) {
    throw new Error(`Unknown settings schemaVersion: ${version}`);
  }

  const now = Date.now();
  const providers = (Array.isArray(obj.providers) ? obj.providers : []).map(backfillProviderKind);
  const bindings = Array.isArray(obj.bindings) ? obj.bindings : [];

  // v0.2 起 roles 是核心；v1 不会有此字段，按内置 seed + 老 bindings 派生
  let roles: AiRole[];
  if (version === 2 && Array.isArray(obj.roles) && obj.roles.length > 0) {
    roles = obj.roles.map(normalizeRole);
    // 兜底：内置角色不能少（用户配置可能漏掉某个）
    for (const seed of BUILTIN_ROLE_SEEDS) {
      if (!roles.some((r) => r.id === seed.id)) {
        roles.push(applyExistingRoleToSeed(seed, roles, bindings, now));
      }
    }
  } else {
    // v1 → v2 首次迁移：5 个内置 seed × 老 bindings 拼接
    roles = BUILTIN_ROLE_SEEDS.map((seed) => applyBindingToSeed(seed, bindings, now));
  }

  return {
    schemaVersion: SETTINGS_LATEST_VERSION,
    providers,
    bindings: [], // 迁移后清空，不再被读路径使用；保留字段以做反向兼容
    roles,
    apiKeys:
      typeof obj.apiKeys === "object" && obj.apiKeys !== null
        ? (obj.apiKeys as Record<string, string>)
        : {},
    ui: {
      alpha: normalizeAlpha(obj.ui?.alpha),
      aetherInboxFolder:
        typeof obj.ui?.aetherInboxFolder === "string" ? obj.ui.aetherInboxFolder : "Aether Inbox",
      scanScope: obj.ui?.scanScope === "aether-inbox-only" ? "aether-inbox-only" : "vault",
      language: obj.ui?.language === "en" ? "en" : "zh-CN",
    },
    budgets: {
      monthlyTokenWarn: normalizeMonthlyTokenWarn(obj.budgets?.monthlyTokenWarn),
    },
    flags: {
      aiTrace: Boolean(obj.flags?.aiTrace),
    },
  };
}

function normalizeMonthlyTokenWarn(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function normalizeAlpha(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.4;
  return Math.min(1, Math.max(0, value));
}

/** 老配置没有 kind 字段；从 baseUrl 反查预设，找不到就标 "custom"。 */
function backfillProviderKind(p: ProviderConfig): ProviderConfig {
  if (p.kind) return p;
  const preset = findPresetByBaseUrl(p.baseUrl);
  return { ...p, kind: preset?.id ?? "custom" };
}

/** 把老的 FeatureBinding 套到内置 seed 上：feature.id 与 role.id 一一对齐。 */
function applyBindingToSeed(
  seed: (typeof BUILTIN_ROLE_SEEDS)[number],
  bindings: FeatureBinding[],
  now: number,
): AiRole {
  const role = seedToRole(seed, now);
  const b = findBindingForSeed(seed.id, bindings);
  if (b) {
    role.providerId = b.providerId;
    role.modelName = b.modelName;
    const temperature = normalizeTemperature(b.params.temperature);
    if (temperature !== undefined) {
      role.params.temperature = temperature;
    }
    const maxTokens = normalizeMaxTokens(b.params.maxTokens);
    if (maxTokens !== undefined) {
      role.params.maxTokens = maxTokens;
    }
  }
  return role;
}

function findBindingForSeed(
  seedId: BuiltInRoleId,
  bindings: FeatureBinding[],
): FeatureBinding | undefined {
  const direct = bindings.find((x) => (x.feature as BuiltInRoleId) === seedId);
  if (direct) return direct;
  if (seedId !== "answer") return undefined;
  return (
    bindings.find((x) => x.feature === "summarize") ??
    bindings.find((x) => x.feature === "rewrite") ??
    bindings.find((x) => x.feature === "extract") ??
    bindings.find((x) => x.feature === "critique") ??
    bindings.find((x) => x.feature === "inbox_metadata")
  );
}

function applyExistingRoleToSeed(
  seed: (typeof BUILTIN_ROLE_SEEDS)[number],
  roles: AiRole[],
  bindings: FeatureBinding[],
  now: number,
): AiRole {
  const role = applyBindingToSeed(seed, bindings, now);
  if (seed.id !== "answer" || role.providerId) return role;
  const source =
    roles.find((r) => r.id === "summarize" && r.providerId && r.modelName) ??
    roles.find((r) => r.id === "rewrite" && r.providerId && r.modelName) ??
    roles.find((r) => r.id === "extract" && r.providerId && r.modelName) ??
    roles.find((r) => r.id === "critique" && r.providerId && r.modelName) ??
    roles.find((r) => r.id === "inbox_metadata" && r.providerId && r.modelName);
  if (!source) return role;
  return {
    ...role,
    providerId: source.providerId,
    modelName: source.modelName,
  };
}

/** 用户已存在的 role 配置可能缺字段，补齐默认值，避免运行时崩。 */
function normalizeRole(r: Partial<AiRole>): AiRole {
  const id = String(r.id ?? "");
  const seed = BUILTIN_ROLE_SEEDS.find((s) => s.id === id);
  return {
    id,
    builtIn: r.builtIn ?? !!seed,
    name: r.name ?? seed?.name ?? id,
    icon: r.icon ?? seed?.icon ?? "sparkles",
    description: r.description ?? seed?.description ?? "",
    providerId: r.providerId ?? "",
    modelName: r.modelName ?? "",
    promptTemplate: r.promptTemplate ?? seed?.promptTemplate ?? "",
    variables: Array.isArray(r.variables) ? r.variables : (seed?.variables ?? []),
    outputKind: r.outputKind ?? seed?.outputKind ?? "text",
    params: normalizeRoleParams(r.params ?? seed?.params ?? {}),
    enabled: r.enabled ?? true,
    showInEditor: r.showInEditor ?? seed?.showInEditor ?? true,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
  };
}

function normalizeRoleParams(params: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...params };
  if ("temperature" in normalized) {
    const temperature = normalizeTemperature(normalized.temperature);
    if (temperature === undefined) delete normalized.temperature;
    else normalized.temperature = temperature;
  }
  if ("maxTokens" in normalized) {
    const maxTokens = normalizeMaxTokens(normalized.maxTokens);
    if (maxTokens === undefined) delete normalized.maxTokens;
    else normalized.maxTokens = maxTokens;
  }
  return normalized;
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

// re-export for clarity
export type Feature_ = Feature;
