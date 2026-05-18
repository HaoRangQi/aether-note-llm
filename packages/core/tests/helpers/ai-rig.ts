import { MockProvider } from "../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../src/provider/registry.js";
import { RoleRegistry } from "../../src/roles/role-registry.js";
import { BUILTIN_ROLE_SEEDS, seedToRole } from "../../src/roles/default-roles.js";
import type { AiRole, BuiltInRoleId } from "../../src/index.js";

/**
 * 测试 rig：创建一个 ProviderRegistry + RoleRegistry，
 * 把指定的 builtin role 都绑到 provider "p" / model "m"。
 */
export function makeAiRig(
  provider: MockProvider,
  roleIds: BuiltInRoleId[] = ["summarize", "rewrite", "extract", "inbox_metadata", "embedding"],
): { registry: ProviderRegistry; roles: RoleRegistry } {
  const registry = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
    fetch: async () => new Response("{}"),
  });
  registry.setConfigs([
    {
      id: "p",
      name: "p",
      baseUrl: "https://x",
      apiKeyRef: "k",
      defaultHeaders: {},
      enabled: true,
      createdAt: 0,
    },
  ]);
  registry.setApiKeys({ k: "s" });

  const roles = new RoleRegistry();
  const list: AiRole[] = BUILTIN_ROLE_SEEDS
    .filter((s) => roleIds.includes(s.id))
    .map((s) => {
      const r = seedToRole(s, 0);
      r.providerId = "p";
      r.modelName = "m";
      return r;
    });
  roles.setRoles(list);

  return { registry, roles };
}
