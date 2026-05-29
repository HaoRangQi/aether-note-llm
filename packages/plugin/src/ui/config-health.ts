import {
  BUILTIN_ROLE_SEEDS,
  findPresetById,
  type AiRole,
  type BuiltInRoleId,
  type PersistedSettings,
  type ProviderConfig,
} from "@aether/core";

export type HealthStatus = "ready" | "warn" | "error";
export type HealthIssueCode =
  | "noProvider"
  | "roleMissing"
  | "roleDisabled"
  | "roleProviderMissing"
  | "providerMissing"
  | "providerDisabled"
  | "providerBaseUrlMissing"
  | "providerBaseUrlInvalid"
  | "apiKeyMissing"
  | "modelMissing"
  | "modelIncompatible";

export interface HealthIssue {
  code: HealthIssueCode;
  roleName?: string;
  severity: Exclude<HealthStatus, "ready">;
}

export interface ConfigHealth {
  status: HealthStatus;
  issues: HealthIssue[];
}

export function getConfigHealth(settings: PersistedSettings): ConfigHealth {
  if (settings.providers.length === 0) {
    return {
      status: "error",
      issues: [{ code: "noProvider", severity: "error" }],
    };
  }

  const providers = new Map(settings.providers.map((p) => [p.id, p]));
  const roles = new Map(settings.roles.map((r) => [r.id, r]));
  const issues: HealthIssue[] = [];

  for (const seed of BUILTIN_ROLE_SEEDS) {
    const role = roles.get(seed.id);
    const required = roleIsRequired(seed.id, seed.showInEditor, role);
    if (!required) continue;

    const roleName = roleDisplayName(seed.id, role);
    const degradedSeverity = seed.id === "embedding" ? "warn" : "error";
    if (!role) {
      issues.push({ code: "roleMissing", roleName, severity: degradedSeverity });
      continue;
    }
    if (!role.enabled) {
      issues.push({ code: "roleDisabled", roleName, severity: degradedSeverity });
      continue;
    }
    if (!role.providerId) {
      issues.push({ code: "roleProviderMissing", roleName, severity: degradedSeverity });
      continue;
    }

    const provider = providers.get(role.providerId);
    if (!provider) {
      issues.push({ code: "providerMissing", roleName, severity: degradedSeverity });
      continue;
    }
    if (!provider.enabled) {
      issues.push({ code: "providerDisabled", roleName, severity: degradedSeverity });
      continue;
    }
    if (provider.baseUrl.trim().length === 0) {
      issues.push({ code: "providerBaseUrlMissing", roleName, severity: degradedSeverity });
    } else if (!isValidHttpUrl(provider.baseUrl)) {
      issues.push({ code: "providerBaseUrlInvalid", roleName, severity: degradedSeverity });
    }
    if (!role.modelName) {
      issues.push({ code: "modelMissing", roleName, severity: degradedSeverity });
    } else if (!roleModelLooksCompatible(seed.id, role, provider)) {
      issues.push({ code: "modelIncompatible", roleName, severity: degradedSeverity });
    }
    if (!hasApiKey(settings, provider)) {
      issues.push({ code: "apiKeyMissing", roleName, severity: degradedSeverity });
    }
  }

  const status: HealthStatus = issues.some((i) => i.severity === "error")
    ? "error"
    : issues.length > 0
      ? "warn"
      : "ready";
  return { status, issues };
}

function roleIsRequired(id: BuiltInRoleId, defaultShowInEditor: boolean, role?: AiRole): boolean {
  if (id === "inbox_metadata" || id === "embedding") return true;
  if (id === "answer") return true;
  if (id === "solve") return true;
  if (!role) return defaultShowInEditor;
  return role?.enabled === true && role.showInEditor === true;
}

function roleModelLooksCompatible(
  id: BuiltInRoleId,
  role: AiRole,
  provider: ProviderConfig,
): boolean {
  const preset = provider.kind ? findPresetById(provider.kind) : undefined;
  if (!preset || preset.id === "custom") return true;
  const looksEmbedding =
    /\b(embed|embedding|bge|e5|gte|jina-embeddings|nomic-embed|text-embedding)\b/i.test(
      role.modelName,
    );
  if (id === "embedding") return preset.recommendedFor.embedding === true && looksEmbedding;
  if (preset.recommendedFor.chat === true && looksEmbedding) return false;
  return true;
}

function hasApiKey(settings: PersistedSettings, provider: ProviderConfig): boolean {
  const preset = provider.kind ? findPresetById(provider.kind) : undefined;
  if (preset?.requiresApiKey === false) return true;
  return (
    provider.apiKeyRef.trim().length > 0 && Boolean(settings.apiKeys[provider.apiKeyRef]?.trim())
  );
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function roleDisplayName(id: BuiltInRoleId, role?: AiRole): string {
  if (role?.name) return role.name;
  return BUILTIN_ROLE_SEEDS.find((seed) => seed.id === id)?.name ?? id;
}
