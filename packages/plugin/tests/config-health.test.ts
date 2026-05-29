import { describe, expect, it } from "vitest";
import {
  BUILTIN_ROLE_SEEDS,
  migrateSettings,
  seedToRole,
  type AiRole,
  type PersistedSettings,
  type ProviderConfig,
} from "@aether/core";
import { getConfigHealth } from "../src/ui/config-health.js";

const provider: ProviderConfig = {
  id: "provider-1",
  name: "Test Provider",
  baseUrl: "https://example.test/v1",
  apiKeyRef: "key:provider-1",
  defaultHeaders: {},
  enabled: true,
  createdAt: 0,
  kind: "custom",
};

function configuredSettings(): PersistedSettings {
  const roles = BUILTIN_ROLE_SEEDS.map((seed) => {
    const role = seedToRole(seed, 0);
    role.providerId = provider.id;
    role.modelName = seed.outputKind === "embedding" ? "embed-model" : "chat-model";
    return role;
  });

  return migrateSettings({
    schemaVersion: 2,
    providers: [{ ...provider }],
    roles,
    apiKeys: { [provider.apiKeyRef]: "test-key" },
  });
}

function updateRole(
  settings: PersistedSettings,
  id: string,
  fn: (role: AiRole) => void,
): PersistedSettings {
  const role = settings.roles.find((r) => r.id === id);
  if (role) fn(role);
  return settings;
}

describe("getConfigHealth", () => {
  it("reports setup error when no provider exists", () => {
    const health = getConfigHealth(migrateSettings({}));

    expect(health.status).toBe("error");
    expect(health.issues).toContainEqual({ code: "noProvider", severity: "error" });
  });

  it("is ready when builtin roles have provider, model, and API key", () => {
    expect(getConfigHealth(configuredSettings())).toEqual({ status: "ready", issues: [] });
  });

  it("reports missing API keys for required chat roles", () => {
    const settings = configuredSettings();
    settings.apiKeys = {};

    const health = getConfigHealth(settings);

    expect(health.status).toBe("error");
    expect(health.issues).toContainEqual({
      code: "apiKeyMissing",
      roleName: "导入元数据",
      severity: "error",
    });
  });

  it("reports missing or invalid provider base URLs before runtime calls fail", () => {
    const missing = configuredSettings();
    missing.providers[0]!.baseUrl = "";

    expect(getConfigHealth(missing).issues).toContainEqual({
      code: "providerBaseUrlMissing",
      roleName: "导入元数据",
      severity: "error",
    });

    const invalid = configuredSettings();
    invalid.providers[0]!.baseUrl = "not-a-url";

    expect(getConfigHealth(invalid).issues).toContainEqual({
      code: "providerBaseUrlInvalid",
      roleName: "导入元数据",
      severity: "error",
    });
  });

  it("treats embedding-only issues as warning because BM25 can still search", () => {
    const settings = updateRole(configuredSettings(), "embedding", (role) => {
      role.providerId = "";
      role.modelName = "";
    });

    const health = getConfigHealth(settings);

    expect(health.status).toBe("warn");
    expect(health.issues).toEqual([
      {
        code: "roleProviderMissing",
        roleName: "嵌入向量",
        severity: "warn",
      },
    ]);
  });

  it("warns when embedding is bound to a known chat-only provider", () => {
    const settings = configuredSettings();
    const embedding = settings.roles.find((r) => r.id === "embedding")!;
    embedding.providerId = provider.id;
    embedding.modelName = "deepseek-chat";
    settings.providers[0]!.kind = "deepseek";

    const health = getConfigHealth(settings);

    expect(health.status).toBe("warn");
    expect(health.issues).toContainEqual({
      code: "modelIncompatible",
      roleName: "嵌入向量",
      severity: "warn",
    });
  });

  it("does not guess compatibility for custom embedding providers", () => {
    const settings = configuredSettings();
    const embedding = settings.roles.find((r) => r.id === "embedding")!;
    embedding.modelName = "private-vector-v1";
    settings.providers[0]!.kind = "custom";

    expect(getConfigHealth(settings)).toEqual({ status: "ready", issues: [] });
  });

  it("reports known chat roles bound to embedding-looking models", () => {
    const settings = configuredSettings();
    const metadata = settings.roles.find((r) => r.id === "inbox_metadata")!;
    metadata.modelName = "BAAI/bge-m3";
    settings.providers[0]!.kind = "siliconflow";

    const health = getConfigHealth(settings);

    expect(health.status).toBe("error");
    expect(health.issues).toContainEqual({
      code: "modelIncompatible",
      roleName: "导入元数据",
      severity: "error",
    });
  });

  it("does not require API keys for local no-key presets", () => {
    const settings = configuredSettings();
    settings.providers[0]!.kind = "ollama";
    settings.providers[0]!.apiKeyRef = "key:missing";
    settings.apiKeys = {};

    expect(getConfigHealth(settings)).toEqual({ status: "ready", issues: [] });
  });

  it("requires answer because generated answers are part of the core Hub flow", () => {
    const settings = updateRole(configuredSettings(), "answer", (role) => {
      role.providerId = "";
      role.modelName = "";
    });

    const health = getConfigHealth(settings);

    expect(health.status).toBe("error");
    expect(health.issues).toContainEqual({
      code: "roleProviderMissing",
      roleName: "综合回答",
      severity: "error",
    });
  });

  it("requires solve because problem solving is part of the core Hub flow", () => {
    const settings = updateRole(configuredSettings(), "solve", (role) => {
      role.providerId = "";
      role.modelName = "";
    });

    const health = getConfigHealth(settings);

    expect(health.status).toBe("error");
    expect(health.issues).toContainEqual({
      code: "roleProviderMissing",
      roleName: "解决问题",
      severity: "error",
    });
  });

  it("does not warn for editor roles the user intentionally hides", () => {
    const settings = updateRole(configuredSettings(), "critique", (role) => {
      role.enabled = false;
      role.showInEditor = false;
      role.providerId = "";
      role.modelName = "";
    });

    expect(getConfigHealth(settings)).toEqual({ status: "ready", issues: [] });
  });
});
